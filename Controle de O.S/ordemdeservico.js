import { client } from './supabaseClient.js';

const API_BASE = 'https://sistema-brt-sombra.onrender.com';

// =====================================================================
// 🔒 GUARDA DE ROTA E 👤 DADOS DO USUÁRIO LOGADO
// =====================================================================
const crachaString = localStorage.getItem('maas_usuario_logado');

function verificarAcessoOS() {
    if (!crachaString) {
        alert("Acesso Negado. Faça o index primeiro.");
        window.location.href = "../index.html"; 
        return false;
    }

    const usuario = JSON.parse(crachaString);

   if (usuario.grupo !== 'Maas' || usuario.subgrupo !== 'Manutencao') {
    alert(`Acesso Restrito! Seu perfil (${usuario.grupo} - ${usuario.subgrupo || 'Sem Subgrupo'}) não tem permissão para acessar Ordens de Serviço.`);
    window.location.href = "../index.html";
    return false;
}

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
    const lblNome = document.getElementById('lblNomeUsuario');
    if (lblNome) lblNome.innerText = `👤 Olá, ${usuarioLogado.nome}`;

    document.getElementById('btnSair')?.addEventListener('click', (e) => {
        e.preventDefault();
        if(confirm("Deseja realmente sair do sistema?")) {
            localStorage.removeItem('maas_usuario_logado');
            window.location.href = "../index.html"; 
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

    const chkDisponivel = document.getElementById('chkVeiculoDisponivel');
    const txtDataDisp = document.getElementById('txtDataDisponivel');

    if (chkDisponivel && txtDataDisp) {
        chkDisponivel.addEventListener('change', function() {
            if (this.checked) {
                const agora = new Date();
                const dataFormatada = `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
                txtDataDisp.value = dataFormatada;
            } else {
                txtDataDisp.value = ""; // Limpa se desmarcar
            }
        });
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

    const btnReabrir = document.getElementById('btnReabrirOS');
    if (btnReabrir) {
        if (isFechada) {
            btnReabrir.classList.remove('hidden');
        } else {
            btnReabrir.classList.add('hidden');
        }
    }
    
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

    rascunhoInsumos = [];
    renderizarTabelaRascunho();

    try {
        const os = await dbService.execute(client.from('Ordens_Servico').select('*').eq('numero_sequencial', numOS).maybeSingle());

        if (os) {
            window.idOSGlobal = os.id;
            document.getElementById('txtPrefixo').value = os.prefixo_veiculo || "";
            document.getElementById('numKm').value = os.km_atual || 0;
            document.getElementById('txtDefeito').value = os.defeito_relatado || "";
            
            // 👤 INSERÇÃO: Preenche o campo de serviço realizado se já existir no banco
            const campoServico = document.getElementById('txtServicoRealizado');
            if (campoServico) campoServico.value = os.servico_realizado || "";

            const campoAbertura = document.getElementById('txtDataAbertura');
            if (campoAbertura && os.data_abertura) {
                const d = new Date(os.data_abertura);
                campoAbertura.value = `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            }

            const chkDano = document.getElementById('chkDanoSevero');
            if (chkDano) chkDano.checked = (os.is_dano_severo === true);
            
            const campoLink = document.getElementById('txtLinkDocumentos');
            if(campoLink) campoLink.value = os.link_documentos || "";

            const campoSS = document.getElementById('txtNumSS');
            if(campoSS) campoSS.value = os.numero_ss || "";

            const lblResumo = document.getElementById('lblResumoOS');
            if(lblResumo) lblResumo.innerText = String(os.numero_sequencial).padStart(6, '0');

            const chkDisp = document.getElementById('chkVeiculoDisponivel');
            if (chkDisp) chkDisp.checked = (os.is_veiculo_disponivel === true);

            const campoDataDisp = document.getElementById('txtDataDisponivel');
            if (campoDataDisp && os.data_veiculo_disponivel) {
                try {
                    const [dataParte, horaParte] = os.data_veiculo_disponivel.split('T');
                    const [ano, mes, dia] = dataParte.split('-');
                    const horaMinuto = horaParte.substring(0, 5);
                    campoDataDisp.value = `${dia}/${mes}/${ano} ${horaMinuto}`;
                } catch (e) {
                    const d = new Date(os.data_veiculo_disponivel);
                    campoDataDisp.value = `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
                }
            }
              
            window.atualizarResumoCustosOS(os.id);
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
   FUNÇÃO ATUALIZADA: CALCULAR CUSTOS TOTAIS (HÍBRIDO: ITENS + ENCAMINHAMENTOS)
   ========================================================================== */
window.atualizarResumoCustosOS = async function(idOS, extras = { pecas: 0, mo: 0 }) {
    if (!idOS && extras.pecas === 0 && extras.mo === 0) {
        if(document.getElementById('lblCustoTotal')) document.getElementById('lblCustoTotal').innerText = "R$ 0.00";
        return;
    }

    try {
        let somaPecas = extras.pecas;
        let somaMO = extras.mo;

        if (idOS) {
            const { data: itens } = await client
                .from('itens_servico')
                .select('total, tipo')
                .eq('os_id', idOS);

            itens?.forEach(item => {
                if (item.tipo === 'PRODUTO') somaPecas += item.total;
                else somaMO += item.total; 
            });

            const { data: encsLegados } = await client
                .from('OS_Encaminhamentos')
                .select('insumo_valor_total, tarefa')
                .eq('id_os', idOS);

            encsLegados?.forEach(enc => {
                if (enc.insumo_valor_total > 0) {
                    const tarefaRef = String(enc.tarefa).toUpperCase();
                    if (tarefaRef.includes('MO') || tarefaRef.includes('SERVICO')) {
                        somaMO += enc.insumo_valor_total;
                    } else {
                        somaPecas += enc.insumo_valor_total;
                    }
                }
            });
        }

        const totalGeral = somaPecas + somaMO;

        const lblPecas = document.getElementById('lblCustoPecas');
        const lblMO = document.getElementById('lblCustoMO');
        const lblTotal = document.getElementById('lblCustoTotal');

        if (lblPecas) lblPecas.innerText = `R$ ${somaPecas.toFixed(2)}`;
        if (lblMO) lblMO.innerText = `R$ ${somaMO.toFixed(2)}`;
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

document.getElementById('btnNovoEncaminhamento')?.addEventListener('click', async function() {
    const numOS = document.getElementById('txtNumOS').value;
    const prefixo = document.getElementById('txtPrefixo').value;
    if (!numOS || numOS === "000000" || !prefixo || prefixo === "000000") return alert("Defina as informações: Número da O.S e Prefixo do Veículo.");

    window.idEncaminhamentoAtivo = "TEMP_" + Date.now();
    document.getElementById('txtNumEncaminhamento').value = "PENDENTE";
    document.getElementById('txtCodEtapa').value = "";
    document.getElementById('txtDescricaoEtapa').value = "";
    document.getElementById('txtDataConclusao').value = "Pendente...";

    liberarCamposEncaminhamento(true);
    atualizarDataVisual();

    const defeito = document.getElementById('txtDefeito').value.trim();
    document.getElementById('txtDefeitoEncaminhamento').value = defeito;

    if (!defeito) return;

    // --- 1. Auto-determinar Tarefa pelas palavras-chave do defeito ---
    const cboTarefa = document.getElementById('cboTarefaEncaminhamento');
    if (cboTarefa) {
        let tarefa = 'CORRETIVA';
        if (/preventiva/i.test(defeito)) {
            tarefa = 'PREVENTIVA';
        } else if (/avaria|batida|colis[aã]o|amassado|amassamento|trinca|vidro quebrado|lataria|sinistro|acidente/i.test(defeito)) {
            tarefa = 'SINISTRO';
        } else if (/terminal|parado na via|socorro|bloqueado|imobilizado|sem tra[çc][aã]o|quebrou na via/i.test(defeito)) {
            tarefa = 'SOCORRO';
        }
        cboTarefa.value = tarefa;
    }

    // --- 2. Sugerir Etapa BR via Gemini ---
    const campoEtapa = document.getElementById('txtCodEtapa');
    const campoDesc = document.getElementById('txtDescricaoEtapa');
    if (!campoEtapa || !campoDesc) return;

    campoEtapa.value = '';
    campoDesc.value = '🪄 IA buscando etapa...';
    campoEtapa.disabled = true;

    try {
        const etapas = await dbService.execute(
            client.from('Apoio_Etapas')
                .select('codigo_etapa, descricao')
                .ilike('codigo_etapa', 'BR%')
                .limit(300)
        );

        if (!etapas || etapas.length === 0) {
            campoDesc.value = '';
            return;
        }

        const resp = await fetch(`${API_BASE}/api/sugerir-etapa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defeito, etapas })
        });

        const contentType = resp.headers.get('content-type') || '';
        if (!resp.ok || !contentType.includes('application/json')) {
            console.warn(`sugerir-etapa retornou ${resp.status} — backend precisa ser reimplantado no Render.`);
            campoDesc.value = '';
            return;
        }

        const json = await resp.json();
        if (json.codigo) {
            campoEtapa.value = json.codigo;
            campoDesc.value = json.descricao || '';
        } else {
            campoDesc.value = '';
        }
    } catch (e) {
        console.error('Erro ao sugerir etapa:', e);
        campoDesc.value = '';
    } finally {
        campoEtapa.disabled = false;
    }
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
            alert("Encaminhamento updated!");
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
        
        await carregarInsumosDoEncaminhamento(idEnc);
        
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
        const listaRaw = await dbService.execute(
            client.from('OS_Encaminhamentos')
            .select('*, Apoio_Etapas(descricao)')
            .eq('id_os', window.idOSGlobal)
            .order('numero_encaminhamento', { ascending: true })
        );

        const tbody = document.getElementById('corpoHistoricoEnc');
        if (!tbody) return;

        if (!listaRaw || listaRaw.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum encaminhamento encontrado.</td></tr>';
            return;
        }

        const listaAgrupada = listaRaw.filter((item, index, self) =>
            index === self.findIndex((t) => t.numero_encaminhamento === item.numero_encaminhamento)
        );

        tbody.innerHTML = ""; 
        listaAgrupada.forEach(enc => {
            const num = String(enc.numero_encaminhamento || 0).padStart(3, '0');
            const nomeTarefa = enc.tarefa || '---';
            const nomeEtapa = enc.Apoio_Etapas?.descricao || enc.codigo_etapa || '---';
            const isEncerrado = enc.status_enc === 'CONCLUIDO';
            
            const btnCheck = isEncerrado 
                ? `<button onclick="window.reabrirEncaminhamento('${enc.id}')" class="btn-small" title="Reabrir Encaminhamento" style="background: #f59e0b; color: white;">↩️</button>` 
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

    const totalCalculado = Number((qtd * valor).toFixed(2));

    const item = { 
        tipo: window.tipoBuscaAtual, 
        codigo: document.getElementById('txtCodInsumo').value, 
        descricao: document.getElementById('txtDescInsumo').value, 
        quantidade: qtd, 
        valor_unitario: valor, 
        total: totalCalculado 
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
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Nenhum insumo lançado.</td></tr>`;
        if(msg) msg.style.display = 'none';
        return;
    }

    if(msg) msg.style.display = 'block';
    tbody.innerHTML = "";

    rascunhoInsumos.forEach((item, index) => {
        const badge = item.persistido 
            ? `<span style="background: #ffffff; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 10px;">OFICIAL</span>` 
            : `<span style="background: #ffffff; color: #854d0e; padding: 2px 6px; border-radius: 4px; font-size: 10px;">RASCUNHO</span>`;

        // 🚀 Corrigido: Fechamento correto da tag td na exclusão do insumo
        tbody.innerHTML += `
            <tr class="row-rascunho">
                <td>${item.tipo} ${badge}</td>
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.quantidade}</td>
                <td><strong>R$ ${Number(item.total || 0).toFixed(2)}</strong></td> 
                <td class="text-center">
                    <button class="btn-remove-rascunho" onclick="window.excluirInsumo('${item.id_banco || ""}', null, ${index})">×</button>
                </td>
            </tr>`;
    });
}


function atualizarResumoFinanceiroLocal() {
    let rascunhoPecas = 0;
    let rascunhoMO = 0;

   rascunhoInsumos.forEach(item => {
        if (!item.persistido) { 
            if (item.tipo === 'PRODUTO') rascunhoPecas += item.total;
            else rascunhoMO += item.total;
        }
    });

    window.atualizarResumoCustosOS(window.idOSGlobal, { pecas: rascunhoPecas, mo: rascunhoMO });
}

async function carregarInsumosDoEncaminhamento(idEnc) {
    try {
        const { data: ref } = await client
            .from('OS_Encaminhamentos')
            .select('numero_encaminhamento')
            .eq('id', idEnc)
            .single();

        if (!ref) return;

        const { data: itens, error } = await client
            .from('OS_Encaminhamentos')
            .select('*')
            .eq('id_os', window.idOSGlobal)
            .eq('numero_encaminhamento', ref.numero_encaminhamento);

        if (error) throw error;

        rascunhoInsumos = itens.map(item => ({
            id_banco: item.id,
            tipo: 'PRODUTO', 
            codigo: item.insumo_codigo,
            descricao: item.insumo_descricao,
            quantidade: item.insumo_quantidade,
            total: item.insumo_valor_total,
            persistido: true
        }));

        renderizarTabelaRascunho();
        atualizarResumoFinanceiroLocal();
    } catch (err) {
        console.error("Erro ao sincronizar rascunho:", err);
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
    
    try {
        btn.disabled = true;
        btn.innerHTML = "💾 Salvando...";

        const numOS = parseInt(document.getElementById('txtNumOS').value);
        if (!numOS) throw new Error("Número da O.S. inválido.");

        let osOficial;
        const osExistente = await dbService.execute(client.from('Ordens_Servico').select('id').eq('numero_sequencial', numOS).maybeSingle());

        const linkDoc = document.getElementById('txtLinkDocumentos')?.value || "";
        const numSS = document.getElementById('txtNumSS')?.value || null; 
        const danoSevero = document.getElementById('chkDanoSevero')?.checked || false;
        const veiculoDisponivel = document.getElementById('chkVeiculoDisponivel')?.checked || false;
        const campoDataDisp = document.getElementById('txtDataDisponivel')?.value || null;
        
        // 🚀 TRATAMENTO DA DATA DO COMPONENTE: Converte PT-BR para ISO string
        let dataDisponivelISO = null;
        if (campoDataDisp) {
            const [data, hora] = campoDataDisp.split(' ');
            const [dia, mes, ano] = data.split('/');
            dataDisponivelISO = `${ano}-${mes}-${dia}T${hora}:00`;
        }

        // 1. SALVA OU ATUALIZA A O.S. PRINCIPAL
        if (osExistente) {
            osOficial = await dbService.execute(client.from('Ordens_Servico').update({
                prefixo_veiculo: document.getElementById('txtPrefixo').value,
                defeito_relatado: document.getElementById('txtDefeito').value,
                km_atual: parseInt(document.getElementById('numKm').value) || 0,
                link_documentos: linkDoc,
                numero_ss: numSS,
                is_dano_severo: danoSevero,
                is_veiculo_disponivel: veiculoDisponivel,
                data_veiculo_disponivel: dataDisponivelISO
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
                usuario_abertura: usuarioLogado.nome,
                is_dano_severo: danoSevero,
                is_veiculo_disponivel: veiculoDisponivel,
                data_veiculo_disponivel: dataDisponivelISO
            }]).select().single());
        }

        window.idOSGlobal = osOficial.id;
        
        // ===================================================================
        // 💾 GRAVAÇÃO DO SERVIÇO VIA API (INTEGRAÇÃO BACKEND RENDER - ROTA FIXA)
        // ===================================================================
        const campoServico = document.getElementById('txtServicoRealizado');
        if (campoServico && campoServico.value.trim() !== "") {
            try {
                await fetch(`${API_BASE}/api/os/${numOS}/gravar-servico`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ servico_realizado: campoServico.value.trim() })
                });
            } catch (apiErr) {
                console.error("Erro ao salvar serviço realizado via API:", apiErr);
            }
        }

        // 2. SALVAMENTO DO ENCAMINHAMENTO E INSUMOS
        if (window.idEncaminhamentoAtivo) {
            let numEncFinal;
            const campoNumEnc = document.getElementById('txtNumEncaminhamento');
            const valorTela = campoNumEnc.value;

            // 🚀 LÓGICA DE SEQUENCIAL DINÂMICO GLOBAL CONFORME REQUISITO
            if (valorTela === "PENDENTE" || valorTela === "Nenhum Selecionado") {
                const { data: ultimoEnc } = await client
                    .from('OS_Encaminhamentos')
                    .select('numero_encaminhamento')
                    .order('numero_encaminhamento', { ascending: false })
                    .limit(1);

                numEncFinal = (ultimoEnc && ultimoEnc.length > 0) ? (Number(ultimoEnc[0].numero_encaminhamento) + 1) : 1;
            } else {
                numEncFinal = parseInt(valorTela);
            }

            const dadosBase = { 
                id_os: window.idOSGlobal,
                numero_encaminhamento: numEncFinal, 
                tarefa: document.getElementById('cboTarefaEncaminhamento').value, 
                codigo_etapa: document.getElementById('txtCodEtapa').value, 
                encaminhamento_descricao: document.getElementById('txtDefeitoEncaminhamento').value, 
                cod_fornecedor: document.getElementById('txtCodFornecedor').value, 
                servico_externo: document.getElementById('cboOficinaExterna').value === 'sim',
                status_enc: 'ABERTO'
            };

            const novosItens = rascunhoInsumos.filter(item => !item.persistido);

            if (novosItens.length > 0) {
                const pacoteLinhas = novosItens.map(item => ({
                    ...dadosBase,
                    insumo_codigo: item.codigo,
                    insumo_descricao: item.descricao,
                    insumo_quantidade: item.quantidade,
                    insumo_valor_total: item.total
                }));

                await dbService.execute(client.from('OS_Encaminhamentos').insert(pacoteLinhas));
                campoNumEnc.value = String(numEncFinal).padStart(3, '0');
            } else if (String(window.idEncaminhamentoAtivo).startsWith("TEMP")) {
                await dbService.execute(client.from('OS_Encaminhamentos').insert([dadosBase]));
            } else {
                await dbService.execute(client.from('OS_Encaminhamentos').update(dadosBase).eq('id', window.idEncaminhamentoAtivo));
            }
        }

        if (numSS) {
            await dbService.execute(client.from('Solicitacao_Servicos').update({ status_ss: 'EM ANDAMENTO' }).eq('numero_ss', numSS));
        }

        alert("✅ O.S atualizada com sucesso!");
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => { window.location.reload(); }, 800);

    } catch (err) {
        alert("Erro ao oficializar dados: " + err.message);
        btn.disabled = false;
        btn.innerHTML = "💾 Atualizar O.S";
    } 
});

document.getElementById('btnFinalizarOS')?.addEventListener('click', async function() {
    const num = document.getElementById('txtNumOS').value;
    const idOS = window.idOSGlobal;
    const numOS_int = parseInt(num);

    if (!idOS) return alert("Nenhuma O.S. carregada para finalizar.");

    try {
        const statusAtual = document.getElementById('badgeStatusTopo')?.innerText;

        // 1. Fluxo VALIDAÇÃO → fecha encaminhamentos abertos automaticamente e muda status
        if (statusAtual !== "EM VALIDAÇÃO") {
            if (!confirm(`Deseja enviar a O.S ${num} para VALIDAÇÃO?\nEncaminhamentos abertos serão finalizados automaticamente.`)) return;
            await fecharEncaminhamentosDaOS(idOS);
            await dbService.execute(client.from('Ordens_Servico').update({ status: 'VALIDACAO' }).eq('id', idOS));
            alert("⏳ O.S enviada para Validação!");
            window.location.reload();
            return;
        }

        // 3. Fluxo APROVAR E FECHAR → abre o modal
        const campoServico = document.getElementById('txtServicoRealizado');

        // Se campo vazio, chama a IA primeiro na rota certa do Render
        if (campoServico && campoServico.value.trim() === "") {
            campoServico.placeholder = "🪄 IA gerando descrição técnica...";
            try {
                const response = await fetch(`${API_BASE}/api/os/${numOS_int}/sugerir-servico`);
                const dataIA = await response.json();
                if (dataIA?.sugestao) campoServico.value = dataIA.sugestao;
            } catch (aiErr) {
                console.error("Falha na IA:", aiErr);
            }
        }

        // Abre o modal exposto no escopo global
        window.abrirModalServicoRealizado(num, campoServico?.value || "");

    } catch (err) {
        alert("Erro técnico: " + err.message);
    }
});

// =====================================================================
// MODAL: SERVIÇO REALIZADO (Exposto no objeto window para acesso global)
// =====================================================================
window.abrirModalServicoRealizado = function(numOS, textoAtual) {
    document.getElementById('lblNumOSModal').innerText = `OS #${String(numOS).padStart(6, '0')}`;
    
    const txtModal = document.getElementById('txtServicoModal');
    txtModal.value = textoAtual;
    txtModal.readOnly = true;
    txtModal.style.background = '#f8fafc';
    txtModal.style.cursor = 'default';

    document.getElementById('botoesModalPadrao').style.display = 'flex';
    document.getElementById('botoesModalEdicao').style.display = 'none';
    document.getElementById('modalServicoRealizado').classList.remove('hidden');
};

// Botão Editar
document.getElementById('btnEditarServicoModal')?.addEventListener('click', () => {
    const txtModal = document.getElementById('txtServicoModal');
    txtModal.readOnly = false;
    txtModal.style.background = '#fff';
    txtModal.style.cursor = 'text';
    txtModal.focus();
    document.getElementById('botoesModalPadrao').style.display = 'none';
    document.getElementById('botoesModalEdicao').style.display = 'flex';
});

// Botão Cancelar edição
document.getElementById('btnCancelarEdicaoModal')?.addEventListener('click', () => {
    const txtModal = document.getElementById('txtServicoModal');
    txtModal.readOnly = true;
    txtModal.style.background = '#f8fafc';
    txtModal.style.cursor = 'default';
    document.getElementById('botoesModalPadrao').style.display = 'flex';
    document.getElementById('botoesModalEdicao').style.display = 'none';
});

// Botão Fechar O.S (sem edição)
document.getElementById('btnFecharOSModal')?.addEventListener('click', async () => {
    await executarFechamentoOS();
});

// Botão Salvar serviço e fechar O.S (com edição)
document.getElementById('btnSalvarEFecharModal')?.addEventListener('click', async () => {
    const txtModal = document.getElementById('txtServicoModal');
    const campoServico = document.getElementById('txtServicoRealizado');
    if (campoServico) campoServico.value = txtModal.value; // sincroniza com o campo da tela
    await executarFechamentoOS(txtModal.value);
});

document.getElementById('btnSairOSModal')?.addEventListener('click', () => {
    document.getElementById('modalServicoRealizado').classList.add('hidden');
});

async function executarFechamentoOS(textoServicoEditado = null) {
    const num = document.getElementById('txtNumOS').value;
    const numOS_int = parseInt(num);
    const idOS = window.idOSGlobal;
    const linkDoc = document.getElementById('txtLinkDocumentos')?.value || "";

    try {
        // Salva o serviço realizado se foi editado ou se tem conteúdo (Rota corrigida para a API)
        const textoFinal = textoServicoEditado ?? document.getElementById('txtServicoRealizado')?.value ?? "";
        if (textoFinal.trim() !== "") {
            await fetch(`${API_BASE}/api/os/${numOS_int}/gravar-servico`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ servico_realizado: textoFinal.trim() })
            });
        }

        // Fecha a O.S
        await dbService.execute(client.from('Ordens_Servico').update({
            status: 'FECHADA',
            data_fechamento: new Date().toISOString(),
            usuario_fechamento: usuarioLogado.nome,
            link_documentos: linkDoc,
            servico_realizado: textoFinal.trim()
        }).eq('id', idOS));

        // Baixa SS e Ocorrência
        const numSS = document.getElementById('txtNumSS')?.value;
        const prefixo = document.getElementById('txtPrefixo')?.value;
        if (numSS) await dbService.execute(client.from('Solicitacao_Servicos').update({ status_ss: 'FECHADA' }).eq('numero_ss', numSS));
        if (prefixo) await dbService.execute(client.from('Ocorrencia').update({ status: 'FECHADA' }).eq('prefixo_veiculo', prefixo).eq('status', 'Em Andamento'));

        document.getElementById('modalServicoRealizado').classList.add('hidden');
        alert("✅ O.S Fechada com sucesso!");
        window.location.reload();

    } catch (err) {
        alert("Erro ao fechar O.S: " + err.message);
    }
}

document.getElementById('btnReabrirOS')?.addEventListener('click', async function() {
    const numOS = document.getElementById('txtNumOS').value;
    const idOS = window.idOSGlobal;

    if (!idOS) return;

    if (!confirm(`⚠️ ATENÇÃO: Deseja realmente REABRIR a O.S. ${numOS}?\nIsso permitirá novas alterações e limpará os dados de conclusão.`)) return;

    try {
        const payload = {
            status: 'ABERTA',
            data_fechamento: null,
            usuario_fechamento: null
        };

        const { error } = await client
            .from('Ordens_Servico')
            .update(payload)
            .eq('id', idOS);

        if (error) throw error;

        alert("🔓 O.S. reaberta com sucesso!");
        window.location.reload();

    } catch (err) {
        alert("Erro ao reabrir: " + err.message);
    }
});

/* ==========================================================================
   7. MODAIS E UTILITÁRIOS FINAIS
   ========================================================================== */
window.excluirInsumo = async function(idInsumoBanco, idEncaminhamento, index) {

    if (!confirm("Deseja realmente remover este insumo?")) return;

    try {
        if (idInsumoBanco && idInsumoBanco !== "null" && idInsumoBanco !== "") {
            const { error } = await client
                .from('OS_Encaminhamentos')
                .delete()
                .eq('id', idInsumoBanco);

            if (error) throw error;
            console.log("🗑️ Removido do banco de dados!");
        }

        rascunhoInsumos.splice(index, 1);
        
        renderizarTabelaRascunho();
        atualizarResumoFinanceiroLocal();

    } catch (err) {
        alert("Erro ao excluir: " + err.message);
    }
};

async function carregarSSPendentesNoModal() {
    const tbody = document.getElementById('tabelaSS'); 
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">⏳ A procurar S.S. abertas...</td></tr>';
    try {
        const { data, error } = await client.from('Solicitacao_Servicos').select('*').eq('status_ss', 'ABERTA').order('numero_ss', { ascending: true }); 
        if (error) throw error;
        tbody.innerHTML = ''; 
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #6b7280;">Nenhuma S.S. pendente no momento.</td></tr>';
            return;
        }
        data.forEach(ss => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${ss.numero_ss || '-'}</td><td>${ss.identificacao_veiculo || '-'}</td><td>${ss.servico || '-'}</td><td>${ss.defeito_relatado || 'Sem descrição'}</td><td style="text-align: center;"><button class="btn-importar-linha">Importar</button></td>`;
            tr.querySelector('.btn-importar-linha').addEventListener('click', () => importarDadosDaSSParaOS(ss));
            tbody.appendChild(tr);
        });
    } catch (err) { console.error(err); }
}

async function importarDadosDaSSParaOS(ss) {
    const txtNumSS = document.getElementById('txtNumSS'); 
    if (txtNumSS) txtNumSS.value = ss.numero_ss || '';

    const txtPrefixo = document.getElementById('txtPrefixo'); 
    if (txtPrefixo) { 
        txtPrefixo.value = ss.identificacao_veiculo || ''; 
        txtPrefixo.dispatchEvent(new Event('blur')); 
    }

    const txtDefeito = document.getElementById('txtDefeito'); 
    if (txtDefeito) txtDefeito.value = ss.defeito_relatado || '';

    try {
        const dataOS = await dbService.execute(
            client.from('Ordens_Servico')
            .select('numero_sequencial')
            .order('numero_sequencial', { ascending: false })
            .limit(1)
        );

        let proximoOS = (dataOS && dataOS.length > 0) ? dataOS[0].numero_sequencial + 1 : 1;
        const formatadoOS = String(proximoOS).padStart(6, '0');
        
        const campoNumOS = document.getElementById('txtNumOS');
        if(campoNumOS) campoNumOS.value = formatadoOS;
        
        const lblResumo = document.getElementById('lblResumoOS');
        if(lblResumo) lblResumo.innerText = formatadoOS;
        
        aplicarStatusVisual("ABERTA");
        atualizarTextoBotaoOS(false);
    } catch (err) {
        console.error("Erro ao gerar OS automática na importação:", err);
    }

    document.getElementById('modalSS').classList.add('hidden');
}

function configurarEventosModalEtapas() {
    const btnLupa = document.getElementById('btnLupaEtapa'); 
    const inputBusca = document.getElementById('txtBuscaEtapaModal');
    if (btnLupa) {
        btnLupa.addEventListener('click', () => {
            document.getElementById('modalEtapas').classList.remove('hidden');
            inputBusca.value = ''; carregarEtapasNoModal('');
        });
    }
    document.getElementById('btnFecharModalEtapas')?.addEventListener('click', () => document.getElementById('modalEtapas').classList.add('hidden'));
    inputBusca?.addEventListener('input', debounce((e) => carregarEtapasNoModal(e.target.value.trim()), 400));
}

async function carregarEtapasNoModal(termo) {
    const tbody = document.getElementById('listaBuscaEtapasModal');
    try {
        let query = client.from('Apoio_Etapas').select('*').ilike('codigo_etapa', 'BR%').limit(50);
        if (termo) query = query.ilike('descricao', `%${termo}%`);
        const data = await dbService.execute(query);
        tbody.innerHTML = '';
        data.forEach(etapa => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${etapa.codigo_etapa}</td><td>${etapa.descricao}</td>`;
            tr.onclick = () => {
                document.getElementById('txtCodEtapa').value = etapa.codigo_etapa;
                document.getElementById('txtDescricaoEtapa').value = etapa.descricao;
                document.getElementById('modalEtapas').classList.add('hidden');
            };
            tbody.appendChild(tr);
        });
    } catch (err) { console.error(err); }
}

function configurarEventosModalFornecedores() {
    const btnLupa = document.getElementById('btnLupaFornecedor');
    if (btnLupa) {
        btnLupa.addEventListener('click', () => {
            document.getElementById('modalFornecedores').classList.remove('hidden');
            carregarFornecedoresNoModal('');
        });
    }
    document.getElementById('btnFecharModalFornecedores')?.addEventListener('click', () => document.getElementById('modalFornecedores').classList.add('hidden'));
}

async function carregarFornecedoresNoModal(termo) {
    const tbody = document.getElementById('listaBuscaFornecedoresModal');
    try {
        let query = client.from('Fornecedores').select('*').order('nfantasia', { ascending: true });
        if (termo) query = query.ilike('nfantasia', `%${termo}%`);
        const data = await dbService.execute(query);
        tbody.innerHTML = '';
        data.forEach(forn => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${forn.codigo_fornecedor}</td><td>${forn.nfantasia}</td>`;
            tr.onclick = () => {
                document.getElementById('txtCodFornecedor').value = forn.codigo_fornecedor;
                document.getElementById('modalFornecedores').classList.add('hidden');
            };
            tbody.appendChild(tr);
        });
    } catch (err) { console.error(err); }
}

document.addEventListener('DOMContentLoaded', function() {
    const osVindaDoDashboard = localStorage.getItem('os_para_pesquisar');
    if (osVindaDoDashboard) {
        const campoNumOS = document.getElementById('txtNumOS');
        if (campoNumOS) {
            campoNumOS.value = osVindaDoDashboard;
            localStorage.removeItem('os_para_pesquisar');
            setTimeout(() => { campoNumOS.dispatchEvent(new Event('blur')); }, 100); 
        }
    }
});

window.reabrirEncaminhamento = async function(idEnc) {
    if (!confirm("Deseja REABRIR este encaminhamento para lançar novos insumos?")) return;

    try {
        await dbService.execute(client.from('OS_Encaminhamentos').update({
            status_enc: 'ABERTO',
            data_conclusao: null
        }).eq('id', idEnc));

        alert("🔓 Encaminhamento reaberto!");
        carregarHistoricoEncaminhamentos();
        window.editarEncaminhamento(idEnc);

    } catch (err) {
        alert("Erro ao reabrir encaminhamento: " + err.message);
    }
};

/* ==========================================================================
   CONSULTA O.S FECHADAS
   ========================================================================== */
document.getElementById('btnConsultarFechadas')?.addEventListener('click', () => {
    // Pré-preenche o período com o mês atual
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const pad = n => String(n).padStart(2, '0');
    const toDateInput = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

    document.getElementById('filtroDataInicioFechadas').value = toDateInput(primeiroDia);
    document.getElementById('filtroDataFimFechadas').value = toDateInput(hoje);
    document.getElementById('tabelaOSFechadas').innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #94a3b8;">Selecione um período e clique em Filtrar.</td></tr>';
    document.getElementById('lblTotalOSFechadas').innerText = '';
    document.getElementById('modalOSFechadas').classList.remove('hidden');
});

['btnFecharModalOSFechadas', 'btnFecharModalOSFechadas2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
        document.getElementById('modalOSFechadas').classList.add('hidden');
    });
});

document.getElementById('btnFiltrarOSFechadas')?.addEventListener('click', async function() {
    const dataInicio = document.getElementById('filtroDataInicioFechadas').value;
    const dataFim = document.getElementById('filtroDataFimFechadas').value;

    if (!dataInicio || !dataFim) return alert('Selecione o período de início e fim.');

    const tbody = document.getElementById('tabelaOSFechadas');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px;">⏳ Buscando...</td></tr>';
    this.disabled = true;

    const formatarDataHora = iso => {
        if (!iso) return '—';
        const d = new Date(iso);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    try {
        const { data, error } = await client
            .from('Ordens_Servico')
            .select('id, numero_sequencial, prefixo_veiculo, defeito_relatado, data_abertura, data_fechamento')
            .eq('status', 'FECHADA')
            .gte('data_fechamento', `${dataInicio}T00:00:00`)
            .lte('data_fechamento', `${dataFim}T23:59:59`)
            .order('data_fechamento', { ascending: false });

        if (error) throw error;

        document.getElementById('lblTotalOSFechadas').innerText = `${data.length} registro${data.length !== 1 ? 's' : ''}`;
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #94a3b8;">Nenhuma O.S fechada neste período.</td></tr>';
            return;
        }

        data.forEach(os => {
            const num = String(os.numero_sequencial).padStart(6, '0');
            const defeito = os.defeito_relatado || '—';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 10px 12px; font-weight: 600; font-size: 13px; border-bottom: 1px solid #f1f5f9; white-space: nowrap;">${num}</td>
                <td style="padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; white-space: nowrap;">${os.prefixo_veiculo || '—'}</td>
                <td style="padding: 10px 12px; font-size: 12px; color: #475569; border-bottom: 1px solid #f1f5f9; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${defeito}">${defeito}</td>
                <td style="padding: 10px 12px; font-size: 12px; border-bottom: 1px solid #f1f5f9; white-space: nowrap;">${formatarDataHora(os.data_abertura)}</td>
                <td style="padding: 10px 12px; font-size: 12px; border-bottom: 1px solid #f1f5f9; white-space: nowrap;">${formatarDataHora(os.data_fechamento)}</td>
                <td style="padding: 10px 12px; text-align: center; border-bottom: 1px solid #f1f5f9; white-space: nowrap; display: flex; gap: 6px; justify-content: center;">
                    <button class="btn-small btn-abrir-os" style="background: #0ea5e9; color: white;" data-num="${os.numero_sequencial}">Abrir</button>
                    <button class="btn-small btn-editar-datas" style="background: #f59e0b; color: white;"
                        data-id="${os.id}"
                        data-num="${os.numero_sequencial}"
                        data-abertura="${os.data_abertura || ''}"
                        data-fechamento="${os.data_fechamento || ''}"
                        data-prefixo="${os.prefixo_veiculo || ''}"
                        data-defeito="${(os.defeito_relatado || '').replace(/"/g, '&quot;')}">📅 Datas</button>
                </td>`;
            tr.querySelector('.btn-abrir-os').addEventListener('click', function() {
                document.getElementById('modalOSFechadas').classList.add('hidden');
                const campo = document.getElementById('txtNumOS');
                campo.value = this.dataset.num;
                campo.dispatchEvent(new Event('blur'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            tr.querySelector('.btn-editar-datas').addEventListener('click', function() {
                abrirModalAlterarDatas(this.dataset.id, this.dataset.num, this.dataset.abertura, this.dataset.fechamento, 'fechadas', this.dataset.prefixo, this.dataset.defeito);
            });
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #ef4444;">Erro: ${e.message}</td></tr>`;
    } finally {
        this.disabled = false;
    }
});

/* ==========================================================================
   ALTERAR DATAS DA O.S
   ========================================================================== */

// Estado compartilhado: qual O.S está sendo editada e de onde veio o pedido
let _idOSEditandoDatas = null;
let _origemModalDatas = 'form'; // 'form' | 'fechadas'
let _prefixoOSEditandoDatas = null;
let _defeitoOSEditandoDatas = null;

const _toInputDT = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function abrirModalAlterarDatas(idOS, numOS, dataAbertura, dataFechamento, origem = 'form', prefixo = null, defeito = null) {
    _idOSEditandoDatas = idOS;
    _origemModalDatas = origem;
    _prefixoOSEditandoDatas = prefixo;
    _defeitoOSEditandoDatas = defeito;
    document.getElementById('lblNumOSAlterarDatas').innerText = `#${String(numOS).padStart(6, '0')}`;
    document.getElementById('inputDataAberturaDatas').value = _toInputDT(dataAbertura);
    document.getElementById('inputDataFechamentoDatas').value = _toInputDT(dataFechamento);
    document.getElementById('modalAlterarDatas').classList.remove('hidden');
}

// Botão da barra de ações (O.S carregada no formulário)
document.getElementById('btnAlterarDatas')?.addEventListener('click', async function() {
    if (!window.idOSGlobal) return alert('Carregue uma O.S antes de alterar as datas.');
    try {
        const os = await dbService.execute(
            client.from('Ordens_Servico').select('data_abertura, data_fechamento, prefixo_veiculo, defeito_relatado').eq('id', window.idOSGlobal).single()
        );
        abrirModalAlterarDatas(
            window.idOSGlobal,
            document.getElementById('txtNumOS').value,
            os.data_abertura, os.data_fechamento,
            'form',
            os.prefixo_veiculo, os.defeito_relatado
        );
    } catch (e) {
        console.error('Erro ao carregar datas:', e);
    }
});

['btnFecharModalDatas', 'btnCancelarModalDatas'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
        document.getElementById('modalAlterarDatas').classList.add('hidden');
    });
});

document.getElementById('btnBuscarBigQueryDatas')?.addEventListener('click', async function() {
    if (!_prefixoOSEditandoDatas) return alert('Prefixo não disponível para esta O.S.');
    if (!_defeitoOSEditandoDatas) return alert('Defeito não disponível para esta O.S.');

    this.disabled = true;
    this.innerText = '⏳ Buscando...';

    try {
        const url = `${API_BASE}/api/bigquery/os/${_prefixoOSEditandoDatas}?defeito=${encodeURIComponent(_defeitoOSEditandoDatas)}`;
        const resp = await fetch(url);
        const json = await resp.json();

        if (!resp.ok) throw new Error(json.error || 'Erro desconhecido.');

        // Converte "DD/MM/YYYY, HH:MM:SS" → "YYYY-MM-DDTHH:MM"
        const bqParaInput = (str) => {
            if (!str) return '';
            const [datePart, timePart] = str.split(', ');
            const [dia, mes, ano] = datePart.split('/');
            const [h, m] = timePart.split(':');
            return `${ano}-${mes}-${dia}T${h}:${m}`;
        };

        document.getElementById('inputDataAberturaDatas').value = bqParaInput(json.data_abertura);
        document.getElementById('inputDataFechamentoDatas').value = bqParaInput(json.data_fechamento);

        alert(`✅ Datas preenchidas com dados do BigQuery!\nO.S BigQuery: #${json.numero_os}\nStatus: ${json.status}\n\nClique em 💾 Salvar Datas para confirmar.`);
    } catch (e) {
        alert('Erro ao buscar no BigQuery: ' + e.message);
    } finally {
        this.disabled = false;
        this.innerHTML = '🔄 Buscar do BigQuery';
    }
});

document.getElementById('btnSalvarDatas')?.addEventListener('click', async function() {
    if (!_idOSEditandoDatas) return;

    const abertura = document.getElementById('inputDataAberturaDatas').value;
    const fechamento = document.getElementById('inputDataFechamentoDatas').value;

    if (!abertura) return alert('A data de abertura não pode ficar em branco.');

    const payload = {
        data_abertura: new Date(abertura).toISOString(),
        data_fechamento: fechamento ? new Date(fechamento).toISOString() : null
    };

    try {
        this.disabled = true;
        this.innerText = 'Salvando...';

        await dbService.execute(
            client.from('Ordens_Servico').update(payload).eq('id', _idOSEditandoDatas)
        );

        document.getElementById('modalAlterarDatas').classList.add('hidden');
        alert('✅ Datas atualizadas com sucesso!');

        if (_origemModalDatas === 'fechadas') {
            // Refresca a tabela sem fechar o modal de fechadas
            document.getElementById('btnFiltrarOSFechadas').click();
        } else {
            window.location.reload();
        }
    } catch (e) {
        alert('Erro ao salvar datas: ' + e.message);
    } finally {
        this.disabled = false;
        this.innerHTML = '💾 Salvar Datas';
    }
});

/* ==========================================================================
   INTEGRAÇÃO BIGQUERY — SINCRONIZAR DATAS E DEFEITO
   ========================================================================== */

// Sync individual: O.S carregada no formulário
document.getElementById('btnSincronizarBQ')?.addEventListener('click', async function() {
    if (!window.idOSGlobal) return alert('Carregue uma O.S antes de sincronizar.');

    const prefixo = document.getElementById('txtPrefixo').value.trim();
    const defeito = document.getElementById('txtDefeito').value.trim();

    if (!prefixo) return alert('A O.S não tem prefixo definido.');
    if (!defeito) return alert('A O.S não tem defeito relatado definido.');

    this.disabled = true;
    this.innerText = '⏳ Consultando...';

    try {
        const url = `${API_BASE}/api/bigquery/os/${prefixo}?defeito=${encodeURIComponent(defeito)}`;
        const resp = await fetch(url);
        const contentType = resp.headers.get('content-type') || '';

        if (!contentType.includes('application/json')) {
            throw new Error(`Servidor retornou resposta inesperada (${resp.status}).`);
        }

        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Erro desconhecido.');

        const msg = `✅ Dados encontrados no BigQuery!\n\nO.S BigQuery: #${json.numero_os}\nStatus: ${json.status}\nAbertura: ${json.data_abertura || '—'}\nFechamento: ${json.data_fechamento || '—'}\n\nDeseja atualizar as datas desta O.S com esses dados?`;

        if (!confirm(msg)) return;

        // Converte "DD/MM/YYYY, HH:MM:SS" → ISO para salvar no Supabase
        const bqParaISO = (str) => {
            if (!str) return null;
            const [datePart, timePart] = str.split(', ');
            const [dia, mes, ano] = datePart.split('/');
            return new Date(`${ano}-${mes}-${dia}T${timePart}`).toISOString();
        };

        await dbService.execute(
            client.from('Ordens_Servico').update({
                data_abertura:   bqParaISO(json.data_abertura),
                data_fechamento: bqParaISO(json.data_fechamento),
            }).eq('id', window.idOSGlobal)
        );

        alert('✅ Datas sincronizadas com sucesso!');
        window.location.reload();
    } catch (e) {
        alert('Erro ao sincronizar: ' + e.message);
    } finally {
        this.disabled = false;
        this.innerHTML = '🔄 BigQuery';
    }
});

// Sync em lote: todas as O.S visíveis no modal de fechadas
document.getElementById('btnSincronizarLoteBQ')?.addEventListener('click', async function() {
    const linhas = document.querySelectorAll('#tabelaOSFechadas tr[data-id]');

    // Coleta dados das linhas renderizadas
    const registros = Array.from(document.querySelectorAll('#tabelaOSFechadas .btn-editar-datas')).map(btn => ({
        id_supabase: btn.dataset.id,
        prefixo: btn.closest('tr')?.querySelector('td:nth-child(2)')?.innerText?.trim() || '',
    })).filter(r => r.prefixo && r.prefixo !== '—');

    // Alternativa: coleta via atributos data já presentes nos botões de datas
    const registrosValidos = Array.from(document.querySelectorAll('#tabelaOSFechadas .btn-abrir-os')).map((btn, i) => {
        const btnDatas = btn.closest('td')?.querySelector('.btn-editar-datas');
        const prefixoCell = btn.closest('tr')?.cells[1]?.innerText?.trim();
        return {
            id_supabase: btnDatas?.dataset.id,
            prefixo: prefixoCell,
        };
    }).filter(r => r.id_supabase && r.prefixo && r.prefixo !== '—');

    if (registrosValidos.length === 0) return alert('Filtre as O.S antes de sincronizar.');
    if (!confirm(`Sincronizar ${registrosValidos.length} O.S com o BigQuery?\nDatas de abertura, fechamento e defeito serão atualizados.`)) return;

    const progresso = document.getElementById('progressoLote') || null;
    this.disabled = true;
    this.innerText = '⏳ Sincronizando...';

    try {
        const resp = await fetch(`${API_BASE}/api/bigquery/sincronizar-lote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registros: registrosValidos }),
        });

        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error(`Erro ${resp.status} no servidor.`);

        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Erro desconhecido.');

        const ok  = json.resultados.filter(r => r.sucesso).length;
        const err = json.resultados.filter(r => !r.sucesso).length;

        alert(`✅ Sincronização concluída!\n${ok} atualizadas com sucesso.\n${err} não encontradas no BigQuery.`);
        document.getElementById('btnFiltrarOSFechadas').click();
    } catch (e) {
        alert('Erro ao sincronizar: ' + e.message);
    } finally {
        this.disabled = false;
        this.innerHTML = '🔄 Sincronizar com BigQuery';
    }
});

/* ==========================================================================
   AÇÕES EM LOTE — ENVIAR PARA VALIDAÇÃO / FECHAR MÚLTIPLAS O.S
   ========================================================================== */

// Fecha todos os encaminhamentos ABERTOS de uma O.S de uma vez.
// Chamada tanto no fluxo individual (btnFinalizarOS) quanto no lote.
async function fecharEncaminhamentosDaOS(idOS) {
    const { error } = await client
        .from('OS_Encaminhamentos')
        .update({ status_enc: 'CONCLUIDO', data_conclusao: new Date().toISOString() })
        .eq('id_os', idOS)
        .neq('status_enc', 'CONCLUIDO');
    if (error) throw new Error(error.message);
}

document.getElementById('btnAcoesLote')?.addEventListener('click', () => {
    document.getElementById('modalLote').classList.remove('hidden');
    carregarOSAbertasNoModal();
});

['btnFecharModalLote', 'btnFecharModalLote2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
        document.getElementById('modalLote').classList.add('hidden');
    });
});

document.getElementById('chkSelecionarTodosLote')?.addEventListener('change', function() {
    document.querySelectorAll('.chk-os-lote').forEach(chk => { chk.checked = this.checked; });
    atualizarContadorLote();
});

function atualizarContadorLote() {
    const total = document.querySelectorAll('.chk-os-lote:checked').length;
    const lbl = document.getElementById('lblContadorLote');
    if (lbl) lbl.innerText = `${total} selecionada${total !== 1 ? 's' : ''}`;
}

async function carregarOSAbertasNoModal() {
    const tbody = document.getElementById('tabelaOSLote');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">⏳ Carregando...</td></tr>';
    document.getElementById('progressoLote').style.display = 'none';
    document.getElementById('chkSelecionarTodosLote').checked = false;
    document.getElementById('lblContadorLote').innerText = '0 selecionadas';

    try {
        const { data, error } = await client
            .from('Ordens_Servico')
            .select('id, numero_sequencial, prefixo_veiculo, defeito_relatado, status')
            .in('status', ['ABERTA', 'VALIDACAO'])
            .order('numero_sequencial', { ascending: true });

        if (error) throw error;
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #6b7280;">Nenhuma O.S aberta no momento.</td></tr>';
            return;
        }

        data.forEach(os => {
            const num = String(os.numero_sequencial).padStart(6, '0');
            const statusCor = os.status === 'VALIDACAO' ? '#f59e0b' : '#22c55e';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align: center; padding: 8px; border-bottom: 1px solid #f1f5f9;">
                    <input type="checkbox" class="chk-os-lote" data-id="${os.id}" data-num="${os.numero_sequencial}" style="width: 15px; height: 15px; cursor: pointer;">
                </td>
                <td style="padding: 8px; font-weight: 600; font-size: 13px; border-bottom: 1px solid #f1f5f9;">${num}</td>
                <td style="padding: 8px; font-size: 13px; border-bottom: 1px solid #f1f5f9;">${os.prefixo_veiculo || '-'}</td>
                <td style="padding: 8px; font-size: 12px; color: #475569; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-bottom: 1px solid #f1f5f9;" title="${os.defeito_relatado || ''}">${os.defeito_relatado || '-'}</td>
                <td style="text-align: center; padding: 8px; border-bottom: 1px solid #f1f5f9;">
                    <span style="background: ${statusCor}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">${os.status}</span>
                </td>`;
            tr.querySelector('.chk-os-lote').addEventListener('change', atualizarContadorLote);
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #ef4444;">Erro: ${err.message}</td></tr>`;
    }
}

function obterOSSelecionadas() {
    return Array.from(document.querySelectorAll('.chk-os-lote:checked')).map(chk => ({
        id: chk.dataset.id,
        num: parseInt(chk.dataset.num)
    }));
}

document.getElementById('btnLoteValidacao')?.addEventListener('click', async function() {
    const selecionadas = obterOSSelecionadas();
    if (selecionadas.length === 0) return alert('Selecione ao menos uma O.S.');
    if (!confirm(`Enviar ${selecionadas.length} O.S para VALIDAÇÃO?`)) return;

    const progresso = document.getElementById('progressoLote');
    const lblProgresso = document.getElementById('lblProgressoLote');
    progresso.style.display = 'block';
    progresso.style.background = '#fef3c7';
    progresso.style.color = '#92400e';
    progresso.style.borderColor = '#fde68a';
    this.disabled = true;

    let ok = 0;
    for (const os of selecionadas) {
        lblProgresso.innerText = `Processando O.S ${String(os.num).padStart(6, '0')} (${ok + 1}/${selecionadas.length})...`;
        try {
            await fecharEncaminhamentosDaOS(os.id);
            await dbService.execute(
                client.from('Ordens_Servico').update({ status: 'VALIDACAO' }).eq('id', os.id)
            );
            ok++;
        } catch (e) {
            console.error(`Erro na O.S ${os.num}:`, e.message);
        }
    }

    progresso.style.background = '#f0fdf4';
    progresso.style.color = '#166534';
    progresso.style.borderColor = '#bbf7d0';
    lblProgresso.innerText = `✅ ${ok} de ${selecionadas.length} O.S enviadas para validação.`;
    this.disabled = false;
    carregarOSAbertasNoModal();
});

document.getElementById('btnLoteFechamento')?.addEventListener('click', async function() {
    const selecionadas = obterOSSelecionadas();
    if (selecionadas.length === 0) return alert('Selecione ao menos uma O.S.');
    if (!confirm(`Fechar ${selecionadas.length} O.S? A IA irá gerar o texto de serviço para cada uma.`)) return;

    const progresso = document.getElementById('progressoLote');
    const lblProgresso = document.getElementById('lblProgressoLote');
    progresso.style.display = 'block';
    progresso.style.background = '#eff6ff';
    progresso.style.color = '#1e40af';
    progresso.style.borderColor = '#bfdbfe';
    this.disabled = true;

    let ok = 0;
    const agora = new Date().toISOString();

    for (const os of selecionadas) {
        lblProgresso.innerText = `🪄 Gerando serviço para O.S ${String(os.num).padStart(6, '0')} (${ok + 1}/${selecionadas.length})...`;

        let servicoRealizado = '';
        try {
            const resp = await fetch(`${API_BASE}/api/os/${os.num}/sugerir-servico`);
            const json = await resp.json();
            servicoRealizado = json.sugestao || '';
        } catch (e) {
            console.error(`IA falhou para O.S ${os.num}:`, e.message);
        }

        if (!servicoRealizado) {
            try {
                const osData = await dbService.execute(
                    client.from('Ordens_Servico').select('defeito_relatado').eq('id', os.id).maybeSingle()
                );
                servicoRealizado = `Serviço executado conforme defeito relatado: ${osData?.defeito_relatado || 'conforme O.S.'}.`;
            } catch (e) {
                servicoRealizado = 'Serviço executado conforme O.S.';
            }
        }

        try {
            await dbService.execute(
                client.from('Ordens_Servico').update({
                    status: 'FECHADA',
                    data_fechamento: agora,
                    usuario_fechamento: usuarioLogado.nome,
                    servico_realizado: servicoRealizado
                }).eq('id', os.id)
            );
            ok++;
        } catch (e) {
            console.error(`Erro ao fechar O.S ${os.num}:`, e.message);
        }
    }

    progresso.style.background = '#f0fdf4';
    progresso.style.color = '#166534';
    progresso.style.borderColor = '#bbf7d0';
    lblProgresso.innerText = `✅ ${ok} de ${selecionadas.length} O.S fechadas com sucesso.`;
    this.disabled = false;
    carregarOSAbertasNoModal();
});