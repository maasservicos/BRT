import { client } from './supabaseClient.js';

/* ==========================================================================
   0. CAMADA DE SERVIÇO (DATABASE REPOSITORY)
   Centraliza e trata todos os erros de banco de dados em um só lugar.
   ========================================================================== */
const dbService = {
    // Intercepta qualquer requisição do Supabase e padroniza a resposta/erro
    async execute(query) {
        const { data, error } = await query;
        if (error) {
            console.error("💥 Erro de Banco de Dados:", error);
            throw new Error(error.message || "Erro na comunicação com o servidor.");
        }
        return data;
    }
};

/* ==========================================================================
   ESTADOS GLOBAIS E VARIÁVEIS DE CONTROLE
   ========================================================================== */
window.idOSGlobal = null;            
window.idEncaminhamentoAtivo = null; 
window.tipoBuscaAtual = "PRODUTO"; 
window.itemSelecionadoProtheus = null;
let rascunhoInsumos = []; 

/* ==========================================================================
   1. INICIALIZAÇÃO DA PÁGINA
   ========================================================================== */
document.addEventListener('DOMContentLoaded', function() {
    atualizarDataVisual();
    window.configurarTipo('PRODUTO'); 

    // Espelha o defeito da OS para a observação do encaminhamento
    const txtDefeito = document.getElementById('txtDefeito');
    const txtObs = document.getElementById('txtDefeitoEncaminhamento');
    if (txtDefeito && txtObs) {
        txtDefeito.addEventListener('input', () => { txtObs.value = txtDefeito.value; });
    }

    // Comportamento dos Modais
    document.getElementById('btnLupaInsumo')?.addEventListener('click', () => {
        document.getElementById('modalInsumos').classList.remove('hidden');
        document.getElementById('txtBuscaInsumo').value = "";
        document.getElementById('txtBuscaInsumo').focus();

        if (typeof window.carregarListaInsumosModal === "function") {
        window.carregarListaInsumosModal(""); 
    }
    });

    document.getElementById('btnAbrirModalSS')?.addEventListener('click', () => {
        document.getElementById('modalSS').classList.remove('hidden');
        carregarSSPendentesNoModal();
    });

    document.getElementById('btnFecharModalSS')?.addEventListener('click', () => {
        document.getElementById('modalSS').classList.add('hidden');
    });
});

/* ==========================================================================
   2. UTILITÁRIOS VISUAIS E DE ESTADO (HELPERS)
   ========================================================================== */
function atualizarDataVisual(tipo) {
    const agora = new Date();
    const dataFormatada = `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    
    const campoAbertura = document.getElementById('txtDataAbertura');
    const campoEnc = document.getElementById('txtDataEncaminhamento');
    const campoFechamento = document.getElementById('txtDataFechamento');

    if (!tipo) {
        if (campoAbertura && !campoAbertura.value) campoAbertura.value = dataFormatada;
        if (campoEnc) campoEnc.value = dataFormatada;
    } 
    
    if (tipo === 'fechamento' && campoFechamento) {
        campoFechamento.value = dataFormatada;
    }
}

function aplicarStatusVisual(status) {
    const isFechada = (status === 'FECHADA' || status === 'FINALIZADA');
    const texto = isFechada ? "FECHADA" : "ABERTA";
    const cor = isFechada ? "#ef4444" : "#22c55e"; // Vermelho ou Verde
    
    ['badgeStatusTopo', 'lblStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.innerText = texto; el.style.backgroundColor = cor; el.style.color = "white"; }
    });
    
    document.getElementById('btnSalvarOS').disabled = isFechada;
    document.getElementById('btnFinalizarOS').disabled = isFechada;
}

function atualizarTextoBotaoOS(isEdicao) {
    const btnOS = document.getElementById('btnSalvarOS');
    if (!btnOS) return;

    if (isEdicao) {
        btnOS.innerHTML = "💾 Atualizar O.S";
        btnOS.style.backgroundColor = "#0284c7"; // Azul
    } else {
        btnOS.innerHTML = "💾 Salvar O.S";
        btnOS.style.backgroundColor = "#16a34a"; // Verde
    }
}

// Controla a aba ativa na Seção 5
window.configurarTipo = function(tipo) {
    window.tipoBuscaAtual = tipo;
    const lblCod = document.getElementById('lblTipoInsumo');
    const lblQtd = document.getElementById('lblQtdOuHora');
    
    lblCod.innerText = (tipo === 'TECNICO') ? "Matrícula" : "Cód. Item";
    lblQtd.innerText = (tipo === 'TECNICO') ? "Horas" : "Quantidade";

    const botoesInsumo = document.querySelectorAll('.actions .btn-ghost');
    botoesInsumo.forEach(btn => {
        btn.classList.remove('active');
        const termo = tipo === 'PRODUTO' ? 'Peças' : (tipo === 'SERVICO' ? 'Serviços' : 'Mão de Obra');
        if (btn.innerText.includes(termo)) btn.classList.add('active');
    });
};

/* ==========================================================================
   3. SEÇÕES 1 E 2: REGISTRO DA O.S E IDENTIFICAÇÃO DO ATIVO
   ========================================================================== */
// Botão: Nova O.S
document.getElementById('btnNovaOS')?.addEventListener('click', async function() {
    this.disabled = true;
    try {
        // Usando nossa camada dbService
        const data = await dbService.execute(client.from('Ordens_Servico').select('numero_sequencial').order('numero_sequencial', { ascending: false }).limit(1));
        
        let proximo = (data && data.length > 0) ? data[0].numero_sequencial + 1 : 1;
        const formatado = String(proximo).padStart(6, '0');
        
        document.getElementById('txtNumOS').value = formatado;
        document.getElementById('lblResumoOS').innerText = formatado;
        
        aplicarStatusVisual("ABERTA");
        atualizarTextoBotaoOS(false);
    } catch (err) {
        alert("Erro ao buscar número da O.S: " + err.message);
    } finally { 
        this.disabled = false; 
    }
});

// Gatilho: Pesquisar O.S pelo número
document.getElementById('txtNumOS')?.addEventListener('blur', async function() {
    const numOS = parseInt(this.value);
    if (!numOS || isNaN(numOS)) return;

    try {
        const os = await dbService.execute(client.from('Ordens_Servico').select('*').eq('numero_sequencial', numOS).maybeSingle());

        if (os) {
            window.idOSGlobal = os.id;
            document.getElementById('txtPrefixo').value = os.prefixo_veiculo || "";
            document.getElementById('numKm').value = os.km_atual || 0;
            document.getElementById('txtDefeito').value = os.defeito_relatado || "";
            
            carregarHistoricoEncaminhamentos();
            liberarCamposEncaminhamento(false);
            aplicarStatusVisual(os.status);
            atualizarTextoBotaoOS(true);
            document.getElementById('txtPrefixo').dispatchEvent(new Event('blur'));

            const campoFechamento = document.getElementById('txtDataFechamento');
            if (os.data_fechamento) {
                const d = new Date(os.data_fechamento);
                if (campoFechamento) campoFechamento.value = `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            } else {
                if (campoFechamento) campoFechamento.value = "";
            }
        }    
    } catch (err) {
        console.error("Erro ao carregar O.S:", err);
    }
});

// Gatilho: Pesquisar dados do Veículo pelo Prefixo
document.getElementById('txtPrefixo')?.addEventListener('blur', async function() {
    const prefixo = this.value.trim();
    if (!prefixo) return;
    
    try {
        const v = await dbService.execute(client.from('View_Frota_Completa').select('*').eq('prefixo', prefixo).maybeSingle());
        if (v) {
            document.getElementById('txtPlaca').value = v.placa || "";
            document.getElementById('txtOnibusTipo').value = v.onibus_tipo || "";
            document.getElementById('txtModelo').value = v.modelo || "";
            document.getElementById('txtSituacao').value = v.status || "";
            document.getElementById('txtCliente').value = v.contrato_desc || "";
            document.getElementById('txtContrato').value = v.contrato_cod || "";
            document.getElementById('lblResumoPrefixo').innerText = prefixo;
        }
    } catch (err) {
        console.error("Veículo não encontrado:", err);
    }
});

/* ==========================================================================
   4. SEÇÕES 3 E 4: DIAGNÓSTICO E ENCAMINHAMENTOS
   ========================================================================== */
function liberarCamposEncaminhamento(status) {
    // 1. Removi o '#txtCodFornecedor' desta lista geral
    const seletores = [
        '#cboTarefaEncaminhamento', '#txtCodEtapa', '#cboOficinaExterna', 
        '#txtDataEncaminhamento', '#txtDefeitoEncaminhamento', '#txtCodInsumo', 
        '#numQtdInsumoLinha', '#numValorInsumo', '#btnAdicionarInsumo'
    ];
    
    seletores.forEach(seletor => {
        const el = document.querySelector(seletor);
        if (el) el.disabled = !status;
    });

    // 2. Regra Exclusiva para o Fornecedor (CNPJ)
    const campoFornecedor = document.getElementById('txtCodFornecedor');
    const cboExterna = document.getElementById('cboOficinaExterna');
    
    if (campoFornecedor && cboExterna) {
        if (!status) {
            // Se estiver bloqueando a tela inteira, bloqueia ele também
            campoFornecedor.disabled = true;
        } else {
            // Se estiver liberando a tela, SÓ libera o Fornecedor se estiver "Sim"
            campoFornecedor.disabled = (cboExterna.value !== 'sim');
        }
    }
}

document.getElementById('btnNovoEncaminhamento')?.addEventListener('click', function() {
    const numOS = document.getElementById('txtNumOS').value;
    const prefixo = document.getElementById('txtPrefixo').value;
    if (!numOS || numOS === "000000" || !prefixo || prefixo === "000000") return alert("Defina as informações: Número da O.S e Prefixo do Veículo.");

    window.idEncaminhamentoAtivo = "TEMP_" + Date.now();
    document.getElementById('txtNumEncaminhamento').value = "PENDENTE";
    document.getElementById('txtCodEtapa').value = "";
    document.getElementById('txtDescricaoEtapa').value = "";
    document.getElementById('txtDefeitoEncaminhamento').value = "";
    document.getElementById('txtDataConclusao').value = "Pendente...";
    
    liberarCamposEncaminhamento(true);
    atualizarDataVisual();
});

// Gatilho: Bloqueia/Libera CNPJ conforme o tipo de serviço
document.getElementById('cboOficinaExterna')?.addEventListener('change', function() {
    const campoFornecedor = document.getElementById('txtCodFornecedor');
    if (!campoFornecedor) return;

    if (this.value === 'sim') {
        campoFornecedor.disabled = false;
        campoFornecedor.focus(); // Já joga o cursor para ele digitar
    } else {
        campoFornecedor.disabled = true;
        campoFornecedor.value = ""; // Limpa o campo se ele desistir e marcar "Não"
    }
});

// Busca descrição da Etapa ao sair do campo
document.getElementById('txtCodEtapa')?.addEventListener('blur', async function() {
    const cod = this.value.trim();
    const campoDesc = document.getElementById('txtDescricaoEtapa');
    if (!cod) return;

    try {
        const data = await dbService.execute(client.from('Apoio_Etapas').select('descricao').eq('codigo_etapa', cod).maybeSingle());
        if (data) {
            campoDesc.value = data.descrição || data.descricao || "Coluna não encontrada";
        } else {
            if (campoDesc) campoDesc.value = "Código não cadastrado";
        }
    } catch (err) {
        console.error("Erro ao buscar etapa:", err);
    }
});

// Botão: Salvar Encaminhamento Individual
document.getElementById('btnSalvarEncaminhamento')?.addEventListener('click', async function() {
    if (!window.idOSGlobal) return alert("⚠️ Salve a O.S. principal antes de adicionar encaminhamentos.");

    const tarefa = document.getElementById('cboTarefaEncaminhamento').value;
    const etapa = document.getElementById('txtCodEtapa').value;
    const descricao = document.getElementById('txtDefeitoEncaminhamento').value; 
    const servicoExterno = document.getElementById('cboOficinaExterna').value === 'sim';
    const codFornecedor = document.getElementById('txtCodFornecedor').value;

    if (!tarefa || !etapa) return alert("Preencha Tarefa e Etapa antes de salvar.");

    try {
        if (window.idEncaminhamentoAtivo && !window.idEncaminhamentoAtivo.startsWith('TEMP')) {
            // UPDATE
            await dbService.execute(client.from('OS_Encaminhamentos').update({
                tarefa, codigo_etapa: etapa, encaminhamento_descricao: descricao, servico_externo: servicoExterno, cod_fornecedor: codFornecedor
            }).eq('id', window.idEncaminhamentoAtivo));
            alert("Encaminhamento atualizado!");
        } else {
            // INSERT
            const encs = await dbService.execute(client.from('OS_Encaminhamentos').select('numero_encaminhamento').eq('id_os', window.idOSGlobal));
            const proximoNumero = (encs?.length || 0) + 1;

            await dbService.execute(client.from('OS_Encaminhamentos').insert([{
                id_os: window.idOSGlobal, numero_encaminhamento: proximoNumero, tarefa, codigo_etapa: etapa, encaminhamento_descricao: descricao, servico_externo: servicoExterno, cod_fornecedor: codFornecedor, status_enc: 'ABERTO'
            }]));
            alert("Novo encaminhamento adicionado!");
        }

        carregarHistoricoEncaminhamentos();
        window.idEncaminhamentoAtivo = null;
        document.getElementById('txtNumEncaminhamento').value = "Nenhum Selecionado";
        liberarCamposEncaminhamento(false);

    } catch (err) {
        alert("Erro técnico: " + err.message);
    }
});

// Funções Expostas para a Tabela (onclick HTML)
window.editarEncaminhamento = async function(idEnc) {
    try {
        const enc = await dbService.execute(client.from('OS_Encaminhamentos').select('*').eq('id', idEnc).single());
        if (!enc) return;

        window.idEncaminhamentoAtivo = enc.id;
        liberarCamposEncaminhamento(true);

        document.getElementById('txtNumEncaminhamento').value = String(enc.numero_encaminhamento).padStart(6, '0');
        document.getElementById('cboTarefaEncaminhamento').value = enc.tarefa || "";
        document.getElementById('txtCodEtapa').value = enc.codigo_etapa || "";
        document.getElementById('cboOficinaExterna').value = enc.servico_externo ? "sim" : "nao";
        document.getElementById('cboOficinaExterna').dispatchEvent(new Event('change')); 
        document.getElementById('txtCodFornecedor').value = enc.cod_fornecedor || "";
        document.getElementById('txtDefeitoEncaminhamento').value = enc.encaminhamento_descricao || "";

        
        const campoFechamentoEnc = document.getElementById('txtDataConclusao');
        if (campoFechamentoEnc) {
            if (enc.data_conclusao) {
                const d = new Date(enc.data_conclusao);
                campoFechamentoEnc.value = `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            } else {
                campoFechamentoEnc.value = "Pendente...";
            }
        }
        
        carregarInsumosDoEncaminhamento(idEnc);
        document.getElementById('txtNumEncaminhamento').scrollIntoView({ behavior: 'smooth' });
    } catch(err) {
        console.error("Erro ao carregar edição:", err);
    }
};

window.excluirEncaminhamento = async function(idEnc, statusAtual) {
    if (statusAtual === 'CONCLUIDO') {
        if (!confirm("⚠️ Este encaminhamento está CONCLUÍDO. Tem certeza que deseja apagá-lo?")) return;
    } else {
        if (!confirm("Deseja realmente excluir este encaminhamento?")) return;
    }

    try {
        await dbService.execute(client.from('OS_Encaminhamentos').delete().eq('id', idEnc));
        alert("🗑️ Encaminhamento excluído!");
        
        if (window.idEncaminhamentoAtivo === idEnc) {
            window.idEncaminhamentoAtivo = null;
            document.getElementById('txtNumEncaminhamento').value = "Nenhum Selecionado";
        }
        carregarHistoricoEncaminhamentos();
    } catch (err) {
        alert("Erro técnico ao excluir: " + err.message);
    }
};

window.finalizarEncaminhamento = async function(idEnc) {
    if (!confirm("Deseja encerrar este encaminhamento?")) return;
    try {
        await dbService.execute(client.from('OS_Encaminhamentos').update({ 
            status_enc: 'CONCLUIDO', data_conclusao: new Date().toISOString() 
        }).eq('id', idEnc));
        
        alert("✅ Encaminhamento encerrado!");
        carregarHistoricoEncaminhamentos();
    } catch (err) {
        alert("Erro ao finalizar: " + err.message);
    }
};

async function carregarHistoricoEncaminhamentos() {
    if (!window.idOSGlobal) return;
    try {
        const lista = await dbService.execute(client.from('OS_Encaminhamentos').select('*, Apoio_Etapas(descricao)').eq('id_os', window.idOSGlobal).order('numero_encaminhamento', { ascending: true }));
        const tbody = document.getElementById('corpoHistoricoEnc');
        if (!tbody) return;

        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum encaminhamento encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = ""; 
        lista.forEach(enc => {
            const num = String(enc.numero_encaminhamento || 0).padStart(3, '0');
            const nomeTarefa = enc.tarefa || '---';
            const nomeEtapa = enc.Apoio_Etapas?.descricao || enc.codigo_etapa || '---';
            const isEncerrado = enc.status_enc === 'CONCLUIDO';
            
            const btnCheck = isEncerrado 
                ? `<span title="Concluído" style="font-size: 14px; cursor: help;">✅</span>` 
                : `<button onclick="window.finalizarEncaminhamento('${enc.id}')" class="btn-small" title="Finalizar Encaminhamento">✔️</button>`;
                
            tbody.innerHTML += `
                <tr>
                    <td><strong>${num}</strong></td>
                    <td>${nomeTarefa}</td>
                    <td>${nomeEtapa}</td> 
                    <td class="text-center">
                        ${btnCheck}
                        <button onclick="window.editarEncaminhamento('${enc.id}')" class="btn-small">✏️</button>
                        <button onclick="window.excluirEncaminhamento('${enc.id}', '${enc.status_enc}')" class="btn-small" style="color: #ef4444;">🗑️</button>
                    </td>
                </tr>`;
        });
    } catch (err) {
        console.error("Erro ao carregar histórico:", err);
    }
}

/* ==========================================================================
   5. SEÇÃO 5: INSUMOS (PEÇAS, SERVIÇOS E MÃO DE OBRA) E MODAL SS
   ========================================================================== */

window.carregarListaInsumosModal = async function(termo = "") {
    let config = { tabela: 'Apoio_Produtos', colCod: 'codigo', colDesc: 'descricao' };
    if (window.tipoBuscaAtual === "SERVICO") config = { tabela: 'Apoio_Servicos', colCod: 'codigo', colDesc: 'descricao' };
    if (window.tipoBuscaAtual === "TECNICO") config = { tabela: 'FuncionariosBRT', colCod: 'cod_matricula', colDesc: 'nome' };

    try {
        // 1. Prepara a consulta base com um limite maior para a listagem inicial (ex: 100)
        let query = client.from(config.tabela).select('*').limit(100);
        
        // 2. De acordo com o tipo de busca, aplica o filtro de descrição 
        if (termo) {
            query = query.ilike(config.colDesc, `%${termo}%`);
        }

        const data = await dbService.execute(query);
        const tbody = document.getElementById('listaBuscaInsumos');
        tbody.innerHTML = "";

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted p-15">Nenhum item encontrado.</td></tr>`;
            return;
        }

        // 3. Renderiza a tabela
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.cursor = "pointer";
            tr.innerHTML = `<td>${item[config.colCod]}</td><td>${item[config.colDesc]}</td>`;
            
            tr.onclick = function() {
                tbody.querySelectorAll('tr').forEach(r => r.style.background = "#fff");
                this.style.background = "#d3e4f5";
                window.itemSelecionadoProtheus = { codigo: item[config.colCod], descricao: item[config.colDesc] };
            };
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Erro na busca de insumos:", err);
    }
};

document.getElementById('txtBuscaInsumo')?.addEventListener('input', function() {
    const termo = this.value.toUpperCase().trim();
    
    // Se o usuário apagar o texto todo, recarrega a lista inicial completa
    if (termo.length === 0) {
        window.carregarListaInsumosModal("");
        return;
    }
    
    // Evita pesquisar com apenas 1 letra para não travar o banco
    if (termo.length < 2) return;

    // Dispara a busca com o termo digitado
    window.carregarListaInsumosModal(termo);
});

document.getElementById('btnConfirmarInsumoModal')?.addEventListener('click', () => {
    if (!window.itemSelecionadoProtheus) return alert("Selecione um item!");
    document.getElementById('txtCodInsumo').value = window.itemSelecionadoProtheus.codigo;
    document.getElementById('txtDescInsumo').value = window.itemSelecionadoProtheus.descricao;
    document.getElementById('modalInsumos').classList.add('hidden');
    document.getElementById('numValorInsumo').focus();
});

document.getElementById('btnAdicionarInsumo')?.addEventListener('click', () => {
    if (!window.idEncaminhamentoAtivo) return alert("Gere um 'Novo Encaminhamento' antes de adicionar itens!");

    const qtd = parseFloat(document.getElementById('numQtdInsumoLinha').value) || 0;
    const valor = parseFloat(document.getElementById('numValorInsumo').value) || 0;

    if (qtd <= 0) return alert("Informe a quantidade!");

    const item = { 
        tipo: window.tipoBuscaAtual, 
        codigo: document.getElementById('txtCodInsumo').value, 
        descricao: document.getElementById('txtDescInsumo').value, 
        quantidade: qtd, 
        valor_unitario: valor, 
        total: qtd * valor 
    };

    rascunhoInsumos.push(item);

    document.getElementById('txtCodInsumo').value = ""; 
    document.getElementById('txtDescInsumo').value = "";
    document.getElementById('numQtdInsumoLinha').value = "1";
    document.getElementById('numValorInsumo').value = "";

    renderizarTabelaRascunho();
    atualizarResumoFinanceiroLocal();
});

function renderizarTabelaRascunho() {
    const tbody = document.getElementById('listaItensOS');
    const msg = document.getElementById('msgRascunho');
    
    if (rascunhoInsumos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Nenhum insumo no rascunho.</td></tr>`;
        if(msg) msg.style.display = 'none';
        return;
    }

    if(msg) msg.style.display = 'block';
    tbody.innerHTML = "";

    rascunhoInsumos.forEach((item, index) => {
        tbody.innerHTML += `
            <tr class="row-rascunho">
                <td>${item.tipo} <span class="badge-pendente">RASCUNHO</span></td>
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.quantidade}</td>
                <td>R$ ${item.valor_unitario.toFixed(2)}</td>
                <td>R$ ${item.total.toFixed(2)}</td>
                <td class="text-center">
                    <button class="btn-remove-rascunho" onclick="removerDoRascunho(${index})">×</button>
                </td>
            </tr>`;
    });
}

window.removerDoRascunho = (index) => {
    rascunhoInsumos.splice(index, 1);
    renderizarTabelaRascunho();
    atualizarResumoFinanceiroLocal();
};

function atualizarResumoFinanceiroLocal() {
    const totalRascunho = rascunhoInsumos.reduce((acc, i) => acc + i.total, 0);
    document.getElementById('lblCustoTotal').innerText = `R$ ${totalRascunho.toFixed(2)}`;
}

async function carregarInsumosDoEncaminhamento(idEnc) {
    try {
        const itens = await dbService.execute(client.from('itens_servico').select('*').eq('id_encaminhamento', idEnc));
        const tbody = document.getElementById('listaItensOS');
        tbody.innerHTML = "";
        itens?.forEach(item => {
            tbody.innerHTML += `<tr><td>${item.tipo}</td><td>${item.codigo}</td><td>${item.descricao}</td><td>${item.quantidade}</td><td>R$ ${item.valor_unitario.toFixed(2)}</td><td>R$ ${item.total.toFixed(2)}</td><td><button onclick="excluirInsumo('${item.id}', '${idEnc}')">🗑️</button></td></tr>`;
        });
    } catch (err) {
        console.error("Erro ao carregar insumos:", err);
    }
}

window.vincularSS = function(numero, prefixo, defeito) {
    document.getElementById('txtNumSS').value = numero;
    document.getElementById('txtPrefixo').value = prefixo;
    document.getElementById('txtDefeito').value = defeito;
    document.getElementById('txtPrefixo').dispatchEvent(new Event('blur'));
    document.getElementById('modalSS').classList.add('hidden');
};

/* ==========================================================================
   6. SEÇÃO 6 E BARRA DE AÇÕES: SALVAMENTO E FINALIZAÇÃO GERAL DA O.S
   ========================================================================== */
document.getElementById('btnSalvarOS')?.addEventListener('click', async function() {
    const btn = this;
    if (btn.disabled) return;
    if (!window.idEncaminhamentoAtivo) return alert("Inicie ou selecione um encaminhamento para salvar!");
    
    try {
        btn.disabled = true;
        btn.innerHTML = "💾 Salvando...";

        const numOS = parseInt(document.getElementById('txtNumOS').value);
        if (!numOS) throw new Error("Número da O.S. inválido.");

        let osOficial;
        const osExistente = await dbService.execute(client.from('Ordens_Servico').select('id').eq('numero_sequencial', numOS).maybeSingle());

        if (osExistente) {
            osOficial = await dbService.execute(client.from('Ordens_Servico').update({
                prefixo_veiculo: document.getElementById('txtPrefixo').value,
                defeito_relatado: document.getElementById('txtDefeito').value,
                km_atual: parseInt(document.getElementById('numKm').value) || 0
            }).eq('id', osExistente.id).select().single());
        } else {
            osOficial = await dbService.execute(client.from('Ordens_Servico').insert([{
                numero_sequencial: numOS,
                prefixo_veiculo: document.getElementById('txtPrefixo').value,
                defeito_relatado: document.getElementById('txtDefeito').value,
                km_atual: parseInt(document.getElementById('numKm').value) || 0,
                status: 'ABERTA'
            }]).select().single());
        }

        window.idOSGlobal = osOficial.id;

        let idEncaminhamentoFinal;
        const dadosEnc = { 
            id_os: window.idOSGlobal,
            tarefa: document.getElementById('cboTarefaEncaminhamento').value, 
            codigo_etapa: document.getElementById('txtCodEtapa').value, 
            encaminhamento_descricao: document.getElementById('txtDefeitoEncaminhamento').value, 
            cod_fornecedor: document.getElementById('txtCodFornecedor').value, 
            servico_externo: document.getElementById('cboOficinaExterna').value === 'sim'
        };

        const idAtivo = String(window.idEncaminhamentoAtivo);
        const ehRascunho = idAtivo.startsWith("TEMP") || idAtivo.startsWith("RASCUNHO") || !idAtivo;

        if (ehRascunho) {
            const novoEnc = await dbService.execute(client.from('OS_Encaminhamentos').insert([dadosEnc]).select().single());
            idEncaminhamentoFinal = novoEnc.id;
        } else {
            await dbService.execute(client.from('OS_Encaminhamentos').update(dadosEnc).eq('id', window.idEncaminhamentoAtivo));
            idEncaminhamentoFinal = window.idEncaminhamentoAtivo;
        }

        if (typeof rascunhoInsumos !== 'undefined' && rascunhoInsumos.length > 0) {
            const insumosOficiais = rascunhoInsumos.map(item => ({
                os_id: window.idOSGlobal,
                id_encaminhamento: idEncaminhamentoFinal,
                tipo: item.tipo,
                codigo: item.codigo,
                descricao: item.descricao,
                quantidade: item.quantidade,
                valor_unitario: item.valor_unitario,
                total: item.total
            }));
            await dbService.execute(client.from('itens_servico').insert(insumosOficiais));
        }

        alert("✅ O.S, Encaminhamento e Insumos oficializados com sucesso!");
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => { window.location.reload(); }, 800);

    } catch (err) {
        alert("Erro ao oficializar dados: " + err.message);
        btn.disabled = false;
        btn.innerHTML = "💾 Salvar O.S";
    } 
});

document.getElementById('btnFinalizarOS')?.addEventListener('click', async function() {
    const num = document.getElementById('txtNumOS').value;
    const idOS = window.idOSGlobal;

    if (!idOS) return alert("Nenhuma O.S. carregada para finalizar.");

    try {
        const pendentes = await dbService.execute(client.from('OS_Encaminhamentos').select('numero_encaminhamento').eq('id_os', idOS).neq('status_enc', 'CONCLUIDO'));

        if (pendentes && pendentes.length > 0) {
            const listaPendentes = pendentes.map(p => p.numero_encaminhamento).join(", ");
            return alert(`⚠️ Bloqueio de Processo: Existem encaminhamentos pendentes (${listaPendentes}).\nEncerre todos os encaminhamentos antes de finalizar a O.S.`);
        }

        if (!confirm("Todos os encaminhamentos estão concluídos. Deseja fechar definitivamente a O.S " + num + "?")) return;

        const dataAgora = new Date();
        
        await dbService.execute(client.from('Ordens_Servico').update({ 
            status: 'FECHADA', data_fechamento: dataAgora.toISOString() 
        }).eq('id', idOS));

        atualizarDataVisual('fechamento');
        alert("✅ O.S Fechada com sucesso!");
        window.location.reload(); 

    } catch (err) {
        alert("Erro técnico: " + err.message);
    }
});

function limparTelaOS() {
    window.idOSGlobal = null;
    window.idEncaminhamentoAtivo = null;

    document.querySelectorAll('input, textarea, select').forEach(campo => {
        if (campo.type !== 'button' && campo.type !== 'submit') campo.value = '';
    });

    const tbody = document.getElementById('corpoHistoricoEnc');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Pesquise ou crie uma O.S para ver o histórico</td></tr>';

    if (typeof atualizarTextoBotaoOS === "function") atualizarTextoBotaoOS(false);
    
    const badgeTopo = document.getElementById('badgeStatusTopo');
    if (badgeTopo) {
        badgeTopo.innerText = 'NOVA';
        badgeTopo.style.backgroundColor = '#64748b'; 
    }
        if(document.getElementById('txtDataFechamentoEnc')) {
        document.getElementById('txtDataFechamentoEnc').value = "Pendente...";
    }
}

// =====================================================================
// 1. EVENTOS DO MODAL DE S.S. PENDENTES
// =====================================================================
function configurarEventosModalSS() {
    const modalSS = document.getElementById('modalSS');
    const btnFechar = document.getElementById('btnFecharModalSS');
    
    // ATENÇÃO: Coloque aqui o ID do botão que a pessoa clica para ABRIR o modal
    const btnAbrirModal = document.getElementById('btnLupaSSOrigem'); 

    // Fechar o modal
    if (btnFechar) {
        btnFechar.addEventListener('click', () => {
            modalSS.classList.add('hidden');
        });
    }

    // Abrir o modal e carregar os dados
    if (btnAbrirModal) {
        btnAbrirModal.addEventListener('click', () => {
            modalSS.classList.remove('hidden');
            carregarSSPendentesNoModal(); // Chama a função que vai ao banco
        });
    }
}

// =====================================================================
// 2. BUSCAR AS S.S. NO BANCO (SUPABASE)
// =====================================================================
async function carregarSSPendentesNoModal() {
    const tbody = document.getElementById('tabelaSS'); // O ID do seu HTML
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">⏳ A procurar S.S. abertas...</td></tr>';

    try {
        // Busca S.S. com status ABERTA. Ajuste o nome da tabela se necessário.
        const { data, error } = await client
            .from('Solicitacao_Servicos')
            .select('*')
            .eq('status_ss', 'ABERTA')
            .order('numero_ss', { ascending: true }); 

        if (error) throw error;

        tbody.innerHTML = ''; // Limpa o "A procurar..."

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #6b7280;">Nenhuma S.S. pendente no momento.</td></tr>';
            return;
        }

        // Desenha uma linha para cada S.S. encontrada
        data.forEach(ss => {
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td style="text-align: center; font-weight: bold;">${ss.numero_ss || '-'}</td>
                <td style="text-align: center;">${ss.identificacao_veiculo || '-'}</td>
                <td>${ss.servico || '-'}</td>
                <td>${ss.defeito_relatado || 'Sem descrição'}</td>
                <td style="text-align: center;">
                    <button class="btn-importar-linha" style="padding: 4px 12px; background: #0ea5e9; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Importar
                    </button>
                </td>
            `;

            // O GATILHO: Quando clicar no botão "Importar" DESSA linha
            const btnImportar = tr.querySelector('.btn-importar-linha');
            btnImportar.addEventListener('click', () => importarDadosDaSSParaOS(ss));

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Erro ao carregar S.S.:", err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro ao carregar S.S.</td></tr>';
    }
}

// =====================================================================
// 3. TRANSFERIR OS DADOS PARA A TELA 
// =====================================================================

function importarDadosDaSSParaOS(ss) {
    console.log("📥 Iniciando transferência da S.S para O.S. Dados recebidos:", ss);

    // 1. Campo: NÚMERO DA S.S.
    // Verifique no seu HTML da O.S. qual é o ID exato desta caixinha!
    const txtNumSS = document.getElementById('txtNumSS'); 
    if (txtNumSS) {
        txtNumSS.value = ss.numero_ss || '';
        console.log("✅ Campo Número S.S. preenchido!");
    } else {
        console.error("❌ HTML ID não encontrado: 'txtNumSS'");
    }

    // 2. Campo: PREFIXO DO VEÍCULO
    const txtPrefixo = document.getElementById('txtPrefixo'); 
    if (txtPrefixo) {
        txtPrefixo.value = ss.identificacao_veiculo || '';
        txtPrefixo.dispatchEvent(new Event('blur'));
        console.log("✅ Campo Prefixo preenchido!");
        
    } else {
        console.error("❌ HTML ID não encontrado: 'txtPrefixo'");
    }

    const cboTipoServico = document.getElementById('cboTipoServico'); 
    if (cboTipoServico) {
        // A MÁGICA ACONTECE AQUI: usamos .value em vez de .select
        cboTipoServico.value = ss.servico || ''; 
        
        console.log(`✅ Campo Tipo de Serviço preenchido com: ${ss.servico}`);
    } else {
        console.error("❌ HTML ID não encontrado: 'cboTipoServico'");
    }

    // 3. Campo: DEFEITO RELATADO
    const txtDefeito = document.getElementById('txtDefeito'); 
    if (txtDefeito) {
        txtDefeito.value = ss.defeito_relatado || '';
        console.log("✅ Campo Defeito preenchido!");
    } else {
        console.error("❌ HTML ID não encontrado: 'txtDefeito'");
    }

    // 4. Fechar o Modal
    const modal = document.getElementById('modalSS');
    if (modal) {
        modal.classList.add('hidden');
    }
}