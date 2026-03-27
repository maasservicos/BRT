import { client } from './supabaseClient.js';

// =====================================================================
// 🔒 GUARDA DE ROTA E 👤 DADOS DO USUÁRIO LOGADO
// =====================================================================
const crachaString = localStorage.getItem('maas_usuario_logado');

function verificarAcessoOS() {
    if (!crachaString) {
        alert("Acesso Negado. Faça o login primeiro.");
        window.location.href = "../login.html"; 
        return false;
    }

    const usuario = JSON.parse(crachaString);

    if (usuario.grupo !== 'Maas' || usuario.subgrupo !== 'Manutencao') {
        alert(`Acesso Restrito! Seu perfil (${usuario.grupo} - ${usuario.subgrupo || 'Sem Subgrupo'}) não tem permissão para acessar Ordens de Serviço.`);
        window.location.href = "../login.html";
        return false;
    }

    console.log(`Bem-vindo, ${usuario.nome}! Acesso liberado à O.S.`);
    return true;
}

if (!verificarAcessoOS()) throw new Error("Execução interrompida por falta de permissão.");

const usuarioLogado = JSON.parse(crachaString);

/* ==========================================================================
   0. CAMADA DE SERVIÇO (DATABASE REPOSITORY) E HELPERS GERAIS
   ========================================================================== */
const dbService = {
    async execute(query) {
        const { data, error } = await query;
        if (error) {
            console.error("💥 Erro de Banco de Dados:", error);
            throw new Error(error.message || "Erro na comunicação com o servidor.");
        }
        return data;
    }
};

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

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
    // 👤 PREENCHE O NOME NO TOPO E CONFIGURA O LOGOUT
    const lblNome = document.getElementById('lblNomeUsuario');
    if (lblNome) lblNome.innerText = `👤 Olá, ${usuarioLogado.nome}`;

    document.getElementById('btnSair')?.addEventListener('click', (e) => {
        e.preventDefault();
        if(confirm("Deseja realmente sair do sistema?")) {
            localStorage.removeItem('maas_usuario_logado');
            window.location.href = "../login.html"; 
        }
    });

    atualizarDataVisual();
    window.configurarTipo('PRODUTO'); 

    const txtLinkDoc = document.getElementById('txtLinkDocumentos');
    if (txtLinkDoc) txtLinkDoc.disabled = true;

    const txtDefeito = document.getElementById('txtDefeito');
    const txtObs = document.getElementById('txtDefeitoEncaminhamento');
    if (txtDefeito && txtObs) {
        txtDefeito.addEventListener('input', () => { txtObs.value = txtDefeito.value; });
    }

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

    configurarEventosModalEtapas();
    configurarEventosModalFornecedores();
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
    const isValidacao = (status === 'VALIDACAO'); 
    
    let texto = "ABERTA";
    let cor = "#22c55e"; 

    if (isFechada) {
        texto = "FECHADA"; cor = "#ef4444"; 
    } else if (isValidacao) {
        texto = "EM VALIDAÇÃO"; cor = "#f59e0b"; 
    }
    
    ['badgeStatusTopo', 'lblStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.innerText = texto; el.style.backgroundColor = cor; el.style.color = "white"; }
    });
    
    document.getElementById('btnSalvarOS').disabled = isFechada;
    
    const btnFin = document.getElementById('btnFinalizarOS');
    if (btnFin) {
        btnFin.disabled = isFechada;
        btnFin.innerHTML = isValidacao ? "✅ Aprovar e Fechar O.S" : "📤 Enviar para Validação";
    }

    const txtLinkDoc = document.getElementById('txtLinkDocumentos');
    if (txtLinkDoc) {
        txtLinkDoc.disabled = !isValidacao; 
    }
}

function atualizarTextoBotaoOS(isEdicao) {
    const btnOS = document.getElementById('btnSalvarOS');
    if (!btnOS) return;

    if (isEdicao) {
        btnOS.innerHTML = "💾 Atualizar O.S";
        btnOS.style.backgroundColor = "#0284c7"; 
    } else {
        btnOS.innerHTML = "💾 Salvar O.S";
        btnOS.style.backgroundColor = "#16a34a"; 
    }
}

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
document.getElementById('btnNovaOS')?.addEventListener('click', async function() {
    this.disabled = true;
    try {
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
            
            const campoLink = document.getElementById('txtLinkDocumentos');
            if(campoLink) campoLink.value = os.link_documentos || "";

            const campoSS = document.getElementById('txtNumSS');
            if(campoSS) campoSS.value = os.numero_ss || "";

            const lblResumo = document.getElementById('lblResumoOS');
            if(lblResumo) lblResumo.innerText = String(os.numero_sequencial).padStart(6, '0');
            
            carregarHistoricoEncaminhamentos();
            liberarCamposEncaminhamento(false);
            aplicarStatusVisual(os.status);
            atualizarTextoBotaoOS(true);
            
            window.atualizarResumoCustosOS(os.id);

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
   NOVA FUNÇÃO: CALCULAR CUSTOS TOTAIS DA O.S
   ========================================================================== */
window.atualizarResumoCustosOS = async function(idOS, extras = { pecas: 0, mo: 0 }) {
    if (!idOS && extras.pecas === 0 && extras.mo === 0) return;

    try {
        let pecasBanco = 0;
        let moBanco = 0;

        if (idOS) {
            const itens = await dbService.execute(client.from('itens_servico').select('*').eq('os_id', idOS));
            itens?.forEach(item => {
                if (item.tipo === 'PRODUTO') pecasBanco += item.total;
                else moBanco += item.total; 
            });
        }

        const totalPecas = pecasBanco + extras.pecas;
        const totalMO = moBanco + extras.mo;
        const totalGeral = totalPecas + totalMO;

        const lblPecas = document.getElementById('lblCustoPecas');
        const lblMO = document.getElementById('lblCustoMO');
        const lblTotal = document.getElementById('lblCustoTotal');

        if (lblPecas) lblPecas.innerText = `R$ ${totalPecas.toFixed(2)}`;
        if (lblMO) lblMO.innerText = `R$ ${totalMO.toFixed(2)}`;
        if (lblTotal) lblTotal.innerText = `R$ ${totalGeral.toFixed(2)}`;

    } catch (err) {
        console.error("Erro ao atualizar resumo de custos:", err);
    }
};

/* ==========================================================================
   4. SEÇÕES 3 E 4: DIAGNÓSTICO E ENCAMINHAMENTOS
   ========================================================================== */
function liberarCamposEncaminhamento(status) {
    const seletores = [
        '#cboTarefaEncaminhamento', '#txtCodEtapa', '#btnLupaEtapa', '#cboOficinaExterna', 
        '#txtDataEncaminhamento', '#txtDefeitoEncaminhamento', '#txtCodInsumo', 
        '#numQtdInsumoLinha', '#numValorInsumo', '#btnAdicionarInsumo'
    ];
    
    seletores.forEach(seletor => {
        const el = document.querySelector(seletor);
        if (el) el.disabled = !status;
    });

    const campoFornecedor = document.getElementById('txtCodFornecedor');
    const cboExterna = document.getElementById('cboOficinaExterna');
    const btnLupaForn = document.getElementById('btnLupaFornecedor'); 
    
    if (campoFornecedor && cboExterna) {
        if (!status) {
            campoFornecedor.disabled = true;
            if (btnLupaForn) btnLupaForn.disabled = true;
        } else {
            const isExterno = (cboExterna.value === 'sim');
            campoFornecedor.disabled = !isExterno;
            if (btnLupaForn) btnLupaForn.disabled = !isExterno; 
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

document.getElementById('cboOficinaExterna')?.addEventListener('change', function() {
    const campoFornecedor = document.getElementById('txtCodFornecedor');
    const btnLupaForn = document.getElementById('btnLupaFornecedor'); 

    if (!campoFornecedor) return;

    if (this.value === 'sim') {
        campoFornecedor.disabled = false;
        if (btnLupaForn) btnLupaForn.disabled = false;
        campoFornecedor.focus(); 
    } else {
        campoFornecedor.disabled = true;
        if (btnLupaForn) btnLupaForn.disabled = true;
        campoFornecedor.value = ""; 
    }
});

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
            await dbService.execute(client.from('OS_Encaminhamentos').update({
                tarefa, codigo_etapa: etapa, encaminhamento_descricao: descricao, servico_externo: servicoExterno, cod_fornecedor: codFornecedor
            }).eq('id', window.idEncaminhamentoAtivo));
            alert("Encaminhamento atualizado!");
        } else {
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
        let query = client.from(config.tabela).select('*').limit(100);
        if (termo) query = query.ilike(config.colDesc, `%${termo}%`);

        const data = await dbService.execute(query);
        const tbody = document.getElementById('listaBuscaInsumos');
        tbody.innerHTML = "";

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted p-15">Nenhum item encontrado.</td></tr>`;
            return;
        }

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
    if (termo.length === 0) return window.carregarListaInsumosModal("");
    if (termo.length < 2) return;
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
    let rascunhoPecas = 0;
    let rascunhoMO = 0;

    rascunhoInsumos.forEach(item => {
        if (item.tipo === 'PRODUTO') rascunhoPecas += item.total;
        else rascunhoMO += item.total;
    });

    window.atualizarResumoCustosOS(window.idOSGlobal, { pecas: rascunhoPecas, mo: rascunhoMO });
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

        const linkDoc = document.getElementById('txtLinkDocumentos')?.value || "";
        const numSS = document.getElementById('txtNumSS')?.value || null; 

        if (osExistente) {
            osOficial = await dbService.execute(client.from('Ordens_Servico').update({
                prefixo_veiculo: document.getElementById('txtPrefixo').value,
                defeito_relatado: document.getElementById('txtDefeito').value,
                km_atual: parseInt(document.getElementById('numKm').value) || 0,
                link_documentos: linkDoc,
                numero_ss: numSS 
            }).eq('id', osExistente.id).select().single());
        } else {
            osOficial = await dbService.execute(client.from('Ordens_Servico').insert([{
                numero_sequencial: numOS,
                prefixo_veiculo: document.getElementById('txtPrefixo').value,
                defeito_relatado: document.getElementById('txtDefeito').value,
                km_atual: parseInt(document.getElementById('numKm').value) || 0,
                status: 'ABERTA',
                link_documentos: linkDoc,
                numero_ss: numSS,
                usuario_abertura: usuarioLogado.nome // 🚀 USUÁRIO ABERTURA AQUI
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

        if (numSS) {
            console.log(`Atualizando S.S. ${numSS} para EM ANDAMENTO...`);
            await dbService.execute(client.from('Solicitacao_Servicos')
                .update({ status_ss: 'EM ANDAMENTO' }) 
                .eq('numero_ss', numSS));
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
            return alert(`⚠️ Bloqueio de Processo: Existem encaminhamentos pendentes (${listaPendentes}).\nEncerre todos os encaminhamentos antes de avançar.`);
        }

        const statusAtual = document.getElementById('badgeStatusTopo')?.innerText;
        const linkDoc = document.getElementById('txtLinkDocumentos')?.value || "";

        let novoStatus = "";
        let mensagem = "";

        if (statusAtual === "EM VALIDAÇÃO") {
            if (!confirm(`A O.S ${num} já foi auditada? Deseja FECHAR definitivamente e baixar a S.S/Ocorrência?`)) return;
            novoStatus = "FECHADA";
            mensagem = "✅ O.S Fechada com sucesso! S.S e Ocorrência também foram baixadas.";
        } else {
            if (!confirm(`Deseja enviar a O.S ${num} para a etapa de VALIDAÇÃO?`)) return;
            novoStatus = "VALIDACAO";
            mensagem = "⏳ O.S enviada para Validação!";
        }

        const payload = { 
            status: novoStatus, 
            link_documentos: linkDoc 
        };
        
        if (novoStatus === "FECHADA") {
            payload.data_fechamento = new Date().toISOString();
            payload.usuario_fechamento = usuarioLogado.nome; // 🚀 USUÁRIO FECHAMENTO AQUI
        }

        await dbService.execute(client.from('Ordens_Servico').update(payload).eq('id', idOS));

        if (novoStatus === "FECHADA") {
            const numSS = document.getElementById('txtNumSS')?.value;
            const prefixo = document.getElementById('txtPrefixo')?.value;

            if (numSS) {
                console.log(`Baixando a S.S. ${numSS} para FECHADA...`);
                await dbService.execute(client.from('Solicitacao_Servicos')
                    .update({ status_ss: 'FECHADA' }) 
                    .eq('numero_ss', numSS));
            }

            if (prefixo) {
                console.log(`Baixando ocorrências 'Em Andamento' do veículo ${prefixo}...`);
                await dbService.execute(client.from('Ocorrencia') 
                    .update({ status: 'FECHADA' }) 
                    .eq('prefixo_veiculo', prefixo)
                    .eq('status', 'Em Andamento')); 
            }
        }

        if (novoStatus === "FECHADA") atualizarDataVisual('fechamento');
        alert(mensagem);
        window.location.reload(); 

    } catch (err) {
        alert("Erro técnico: " + err.message);
    }
});

function limparTelaOS() {
    window.idOSGlobal = null;
    window.idEncaminhamentoAtivo = null;

    document.querySelectorAll('input, textarea, select').forEach(campo => {
        if (campo.type !== 'button' && campo.type !== 'submit' && campo.type !== 'checkbox') campo.value = '';
    });
    
    const txtLinkDoc = document.getElementById('txtLinkDocumentos');
    if (txtLinkDoc) txtLinkDoc.disabled = true;

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
    
    window.atualizarResumoCustosOS(null, { pecas: 0, mo: 0 });
}

// =====================================================================
// EVENTOS DO MODAL DE S.S. PENDENTES (E AUTO GERAR O.S)
// =====================================================================
async function carregarSSPendentesNoModal() {
    const tbody = document.getElementById('tabelaSS'); 
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">⏳ A procurar S.S. abertas...</td></tr>';

    try {
        const { data, error } = await client
            .from('Solicitacao_Servicos')
            .select('*')
            .eq('status_ss', 'ABERTA')
            .order('numero_ss', { ascending: true }); 

        if (error) throw error;

        tbody.innerHTML = ''; 

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #6b7280;">Nenhuma S.S. pendente no momento.</td></tr>';
            return;
        }

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

            const btnImportar = tr.querySelector('.btn-importar-linha');
            btnImportar.addEventListener('click', () => importarDadosDaSSParaOS(ss));
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Erro ao carregar S.S.:", err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro ao carregar S.S.</td></tr>';
    }
}

async function importarDadosDaSSParaOS(ss) {
    console.log("📥 DADOS REAIS QUE VIERAM DO SUPABASE:", ss);

    const txtNumSS = document.getElementById('txtNumSS'); 
    if (txtNumSS) {
        txtNumSS.value = ss.numero_ss || ss.id || ss.num_ss || 'ERRO DE COLUNA';
    }

    const txtPrefixo = document.getElementById('txtPrefixo'); 
    if (txtPrefixo) {
        txtPrefixo.value = ss.identificacao_veiculo || '';
        txtPrefixo.dispatchEvent(new Event('blur'));
    }

    const cboTipoServico = document.getElementById('cboTipoServico'); 
    if (cboTipoServico) cboTipoServico.value = ss.servico || ''; 

    const txtDefeito = document.getElementById('txtDefeito'); 
    if (txtDefeito) txtDefeito.value = ss.defeito_relatado || '';

    try {
        const dataOS = await dbService.execute(client.from('Ordens_Servico').select('numero_sequencial').order('numero_sequencial', { ascending: false }).limit(1));
        let proximoOS = (dataOS && dataOS.length > 0) ? dataOS[0].numero_sequencial + 1 : 1;
        const formatadoOS = String(proximoOS).padStart(6, '0');
        
        const campoNumOS = document.getElementById('txtNumOS');
        if(campoNumOS) campoNumOS.value = formatadoOS;
        
        const lblResumo = document.getElementById('lblResumoOS');
        if(lblResumo) lblResumo.innerText = formatadoOS;
        
        aplicarStatusVisual("ABERTA");
        atualizarTextoBotaoOS(false);
        console.log("✅ O.S Auto-gerada:", formatadoOS);
    } catch (err) {
        console.error("Erro ao gerar OS automática na importação:", err);
    }

    const modal = document.getElementById('modalSS');
    if (modal) modal.classList.add('hidden');
}

// =====================================================================
// 7. NOVOS MODAIS: ETAPAS E FORNECEDORES (COM DEBOUNCE APLICADO)
// =====================================================================

function configurarEventosModalEtapas() {
    const btnLupa = document.getElementById('btnLupaEtapa'); 
    const modal = document.getElementById('modalEtapas');
    const btnFechar = document.getElementById('btnFecharModalEtapas');
    const inputBusca = document.getElementById('txtBuscaEtapaModal');

    if (btnLupa) {
        btnLupa.addEventListener('click', () => {
            modal.classList.remove('hidden');
            inputBusca.value = '';
            inputBusca.focus();
            carregarEtapasNoModal('');
        });
    }

    if (btnFechar) btnFechar.addEventListener('click', () => modal.classList.add('hidden'));

    if (inputBusca) {
        const debouncedBusca = debounce((e) => {
            const termo = e.target.value.trim();
            if (termo.length === 0 || termo.length >= 2) carregarEtapasNoModal(termo);
        }, 400); 
        
        inputBusca.addEventListener('input', debouncedBusca);
    }
}

async function carregarEtapasNoModal(termo) {
    const tbody = document.getElementById('listaBuscaEtapasModal');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">⏳ Buscando...</td></tr>';

    try {
        let query = client.from('Apoio_Etapas').select('*').limit(50);
        if (termo) query = query.ilike('descricao', `%${termo}%`);

        const data = await dbService.execute(query);
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">Nenhuma etapa encontrada.</td></tr>`;
            return;
        }

        data.forEach(etapa => {
            const tr = document.createElement('tr');
            tr.style.cursor = "pointer";
            
            tr.innerHTML = `<td>${etapa.codigo_etapa || '-'}</td><td>${etapa.descricao || '-'}</td>`;
            
            tr.onclick = function() {
                const campoCod = document.getElementById('txtCodEtapa'); 
                const campoDesc = document.getElementById('txtDescricaoEtapa'); 
                
                if(campoCod) campoCod.value = etapa.codigo_etapa; 
                if(campoDesc) campoDesc.value = etapa.descricao;
                
                document.getElementById('modalEtapas').classList.add('hidden');
            };
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Erro na busca de etapas:", err);
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-danger">Erro ao carregar.</td></tr>';
    }
}

function configurarEventosModalFornecedores() {
    const btnLupa = document.getElementById('btnLupaFornecedor'); 
    const modal = document.getElementById('modalFornecedores');
    const btnFechar = document.getElementById('btnFecharModalFornecedores');
    const inputBusca = document.getElementById('txtBuscaFornecedorModal');

    if (btnLupa) {
        btnLupa.addEventListener('click', () => {
            modal.classList.remove('hidden');
            inputBusca.value = '';
            inputBusca.focus();
            carregarFornecedoresNoModal('');
        });
    }

    if (btnFechar) btnFechar.addEventListener('click', () => modal.classList.add('hidden'));

    if (inputBusca) {
        const debouncedBuscaForn = debounce((e) => {
            const termo = e.target.value.trim();
            if (termo.length === 0 || termo.length >= 2) carregarFornecedoresNoModal(termo);
        }, 400); 
        
        inputBusca.addEventListener('input', debouncedBuscaForn);
    }
}

async function carregarFornecedoresNoModal(termo) {
    const tbody = document.getElementById('listaBuscaFornecedoresModal');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">⏳ Buscando...</td></tr>';

    try {
        let query = client.from('Fornecedores')
                          .select('*')
                          .order('nfantasia', { ascending: true }); 

        if (termo) {
            query = query.ilike('nfantasia', `%${termo}%`);
        }

        const data = await dbService.execute(query);
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">Nenhum fornecedor encontrado.</td></tr>`;
            return;
        }

        data.forEach(forn => {
            const tr = document.createElement('tr');
            tr.style.cursor = "pointer";
            
            tr.onmouseover = () => tr.style.backgroundColor = "#f1f5f9";
            tr.onmouseout = () => tr.style.backgroundColor = "transparent";

            const identificacao = forn.cnpj_cpf || forn.codigo_fornecedor || '-';
            const nomeFornecedor = forn.nfantasia || '-';

            tr.innerHTML = `<td>${identificacao}</td><td>${nomeFornecedor}</td>`;
            
            tr.onclick = function() {
                const campoFornecedor = document.getElementById('txtCodFornecedor'); 
                
                if(campoFornecedor) campoFornecedor.value = forn.codigo_fornecedor; 
                
                document.getElementById('modalFornecedores').classList.add('hidden');
            };
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Erro na busca de fornecedores:", err);
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-danger">Erro ao carregar.</td></tr>';
    }
}