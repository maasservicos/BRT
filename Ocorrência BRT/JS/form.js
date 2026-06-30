import { client } from './supabaseClient.js';

const API_BASE = 'http://localhost:3000';

// =====================================================================
// 🔒 GUARDA DE ROTA E 👤 DADOS DO USUÁRIO LOGADO (GRUPO BRT)
// =====================================================================
const crachaString = localStorage.getItem('maas_usuario_logado');

function verificarAcessoOcorrencia() {222
    if (!crachaString) {
        alert("Acesso Negado. Faça o login primeiro.");
        window.location.href = "../login.html"; 
        return false;
    }

    const usuario = JSON.parse(crachaString);

    if (usuario.grupo !== 'BRT') {
        alert(`Acesso Restrito! Seu perfil (${usuario.grupo}) não tem permissão para acessar a Abertura de Ocorrências.`);
        window.location.href = "../login.html";
        return false;
    }

    console.log(`Bem-vindo, ${usuario.nome}! Acesso liberado às Ocorrências.`);
    return true;
}

if (!verificarAcessoOcorrencia()) throw new Error("Execução interrompida por falta de permissão.");

const usuarioLogado = JSON.parse(crachaString);

// ============================================================================
// 1. ESTADO GLOBAL E ELEMENTOS DA TELA
// ============================================================================
let estadoOcorrencia = {
    veiculoId: null,
    prefixo: ''
};

// Elementos da Ocorrência
const txtNumOcorrencia = document.getElementById('txtNumOcorrencia');
const btnNovaOcorrencia = document.getElementById('btnNovaOcorrencia');
const txtPrefixoOcorrencia = document.getElementById('txtPrefixoOcorrencia');
const btnBuscaPrefixoOcorrencia = document.getElementById('btnBuscaPrefixoOcorrencia');
const txtNomeBemOcorrencia = document.getElementById('txtNomeBemOcorrencia');
const txtKmAtualOcorrencia = document.getElementById('txtKmAtualOcorrencia');
const txtDataAbertura = document.getElementById('txtDataAberturaOcorrencia');
const txtContatoOcorrencia = document.getElementById('txtContatoOcorrencia');
const cboLocaisConstantes = document.getElementById('cboLocaisConstantes');
const txtDescricaoLocal = document.getElementById('txtDescricaoLocal');
const txtDefeitoRelatado = document.getElementById('txtDefeitoRelatadoOcorrencia');
const txtNumSolicitacaoBRT = document.getElementById('txtNumSolicitacaoBRT');
const formOcorrencia = document.querySelector('form');

// Elementos do Modal
const modalVeiculo = document.getElementById('modalBuscaVeiculo');
const btnFecharModal = document.getElementById('btnFecharModalVeiculo');
const txtPesquisaModal = document.getElementById('txtPesquisaModalVeiculo');

// Inicia os eventos quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    // 👤 PREENCHE O NOME NO TOPO E CONFIGURA O LOGOUT
    const lblNome = document.getElementById('lblNomeUsuario');
    if (lblNome) lblNome.innerText = `👤 Olá, ${usuarioLogado.nome}`;

    document.getElementById('btnSair')?.addEventListener('click', (e) => {
        e.preventDefault();
        if(confirm("Deseja realmente sair do sistema?")) {
            localStorage.removeItem('maas_usuario_logado');
            window.location.href = "/index.html";
        }
    });

    configurarEventosOcorrencia();
    configurarEventosBuscaVeiculo();
    configurarImportacaoSS();
    preencherDataAbertura();
});

// ============================================================================
// 2. EVENTOS DA TELA PRINCIPAL
// ============================================================================
async function gerarProximoNumeroOcorrencia() {
    try {
        const { data, error } = await client
            .from('Ocorrencia') 
            .select('num_ocorrencia') 
            .order('num_ocorrencia', { ascending: false })
            .limit(1);

        if (error) throw error;

        let proximoId = 1; 
        
        if (data && data.length > 0) {
            proximoId = data[0].num_ocorrencia + 1; 
        }

        // NOVA OCORRÊNCIA SEMPRE NASCE PENDENTE E AMARELA!
        const campoStatus = document.getElementById('txtStatusOcorrencia');
        if (campoStatus) {
            campoStatus.value = 'Pendente';
            campoStatus.style.color = '#eab308'; // Amarelo
        }

        txtNumOcorrencia.value = proximoId;
        console.log(`Próximo número gerado: ${proximoId}`);

    } catch (err) {
        console.error("Erro ao gerar próximo número:", err);
        txtNumOcorrencia.value = 'Erro ao gerar';
    }
}

function configurarEventosOcorrencia() {
    
    // -- PESQUISAR Ocorrência ao digitar o Nº e sair do campo --
    txtNumOcorrencia.addEventListener('blur', async () => {
        const idDigitado = txtNumOcorrencia.value.trim();
        if (!idDigitado) return;

        try {
            const { data, error } = await client
                .from('Ocorrencia') 
                .select('*')
                .eq('num_ocorrencia', idDigitado) 
                .single();

            if (error) throw error;

            if (data) {
                txtPrefixoOcorrencia.value = data.prefixo_veiculo || '';
                txtKmAtualOcorrencia.value = data.km_atual || '';
                txtContatoOcorrencia.value = data.contato || '';
                cboLocaisConstantes.value = data.locais_constantes || '';
                txtDescricaoLocal.value = data.descricao_local || '';
                txtDefeitoRelatado.value = data.defeito_relatado || '';
                txtNumSolicitacaoBRT.value = data.num_solicitacao_brt || '';
                
                if(data.data_abertura) {
                    const dataObj = new Date(data.data_abertura);
                    txtDataAbertura.value = dataObj.toLocaleDateString('pt-BR');
                }

                // ==========================================================
                // 🚀 AQUI ESTÁ A MÁGICA DA COR AO PESQUISAR UMA ANTIGA!
                // ==========================================================
                const campoStatus = document.getElementById('txtStatusOcorrencia');
                if (campoStatus) {
                    campoStatus.value = data.status || 'Pendente';
                    
                    if (data.status === 'Pendente') campoStatus.style.color = '#eab308'; // Amarelo
                    if (data.status === 'Em Andamento') campoStatus.style.color = '#3b82f6'; // Azul
                    if (data.status === 'FECHADA' || data.status === 'Finalizada') campoStatus.style.color = '#22c55e'; // Verde
                }
                // ==========================================================

                if (data.prefixo_veiculo) buscarVeiculoDireto(data.prefixo_veiculo);
                
                console.log("Ocorrência carregada com sucesso!");
            }
        } catch (err) {
            console.error(err);
            alert('Ocorrência não encontrada no banco de dados!');
            limparTela();
        }
    });

// ... resto do seu código (btnNovaOcorrencia, etc)

    // -- Botão [+] para NOVA Ocorrência --
    btnNovaOcorrencia.addEventListener('click', async () => {
        limparTela();
        
        // Dá o feedback visual enquanto busca no banco
        txtNumOcorrencia.value = 'Gerando...'; 
        
        // Chama a função que vai no Supabase ver o último número
        await gerarProximoNumeroOcorrencia();
        
        // Pula o cursor para a placa
        txtPrefixoOcorrencia.focus(); 
    });

    // -- SALVAR (Intercepta o submit do form) --
    formOcorrencia.addEventListener('submit', async (e) => {
        e.preventDefault(); // Evita que a página recarregue

        // Validação básica
        if (!txtPrefixoOcorrencia.value || !txtKmAtualOcorrencia.value || !txtDefeitoRelatado.value) {
            alert("Preencha os campos obrigatórios (*)");
            return;
        }

        const dadosParaSalvar = {
            prefixo_veiculo: txtPrefixoOcorrencia.value,
            km_atual: parseInt(txtKmAtualOcorrencia.value),
            contato: txtContatoOcorrencia.value,
            locais_constantes: cboLocaisConstantes.value,
            descricao_local: txtDescricaoLocal.value,
            defeito_relatado: txtDefeitoRelatado.value,
            num_solicitacao_brt: txtNumSolicitacaoBRT.value || null,
            data_abertura: new Date().toISOString(),
            status: 'Pendente',
            usuario_abertura: usuarioLogado.nome
        };

        try {
            const { data, error } = await client
                .from('Ocorrencia') // Nome da tabela
                .insert([dadosParaSalvar])
                .select(); // Retorna o que foi salvo para pegarmos o ID

            if (error) throw error;

            if (data) {
                // Pega o número real que o banco gerou
                const idGerado = data[0].num_ocorrencia; 
                txtNumOcorrencia.value = idGerado;
                alert(`Sucesso! Ocorrência Nº ${idGerado} salva.`);
                
                // Opcional: Limpar a tela após salvar com sucesso para a próxima
                 limparTela();
                 
            }
        } catch (err) {
            console.error("Erro ao salvar:", err);
            alert("Erro ao gravar a ocorrência.");
        }
    });
}

// ============================================================================
// 3. EVENTOS DO MODAL E BUSCA DE VEÍCULO
// ============================================================================
function configurarEventosBuscaVeiculo() {
    
    // Busca rápida ao sair do campo (Blur)
    txtPrefixoOcorrencia.addEventListener('blur', () => {
        const termoDigitado = txtPrefixoOcorrencia.value.trim().replace('-', '');
        if (termoDigitado.length > 0) {
            buscarVeiculoDireto(termoDigitado);
        } else {
            txtNomeBemOcorrencia.value = '';
        }
    });

    txtPrefixoOcorrencia.addEventListener('keypress', (evento) => {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            txtPrefixoOcorrencia.blur(); 
        }
    });

    // Abrir o Modal
    btnBuscaPrefixoOcorrencia.addEventListener('click', () => {
        modalVeiculo.style.display = 'flex'; 
        txtPesquisaModal.value = ''; 
        txtPesquisaModal.focus(); 
        buscarVeiculosNoModal(''); 
    });

    // Fechar o Modal
    btnFecharModal.addEventListener('click', () => {
        modalVeiculo.style.display = 'none';
    });

    // Digitar no Modal
    txtPesquisaModal.addEventListener('input', (evento) => {
        const termo = evento.target.value.trim();
        if (termo.length >= 2 || termo === '') {
            buscarVeiculosNoModal(termo);
        }
    });
}

// ============================================================================
// 4. FUNÇÕES DE SUPABASE E DOM (VEÍCULOS)
// ============================================================================
async function buscarVeiculoDireto(termo) {
    txtNomeBemOcorrencia.value = "Buscando...";
    try {
        const { data, error } = await client
            .from('View_Frota_Completa') 
            .select('*')
            .or(`prefixo.eq.${termo},placa.eq.${termo}`) // Busca por prefixo ou placa
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            selecionarVeiculoDoModal(data[0]); 
        } else {
            alert('⚠️ Veículo não encontrado.');
            txtNomeBemOcorrencia.value = '';
            txtPrefixoOcorrencia.value = ''; 
            setTimeout(() => txtPrefixoOcorrencia.focus(), 100); 
        }
    } catch (err) {
        console.error("Erro na busca direta:", err);
        txtNomeBemOcorrencia.value = '';
    } 
}

async function buscarVeiculosNoModal(termo) {
    const tbody = document.getElementById('tabelaResultadosVeiculos');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">⏳ Buscando veículos...</td></tr>';

    try {
        let query = client.from('View_Frota_Completa').select('*').order('prefixo', { ascending: true });
        
        if (termo !== '') {
            query = query.or(`placa.ilike.%${termo}%,prefixo.ilike.%${termo}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum veículo encontrado.</td></tr>';
            return;
        }

        data.forEach(veiculo => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${veiculo.prefixo || '-'}</td>
                <td>${veiculo.placa || '-'}</td>
                <td>${veiculo.nome_bem || '-'} </td>
                <td>
                    <button class="btn-selecionar-veiculo" style="cursor: pointer; padding: 4px 8px; background: #22c55e; color: white; border: none; border-radius: 4px;">
                        Selecionar
                    </button>
                </td>
            `;

            const btnSelecionar = tr.querySelector('.btn-selecionar-veiculo');
            btnSelecionar.addEventListener('click', () => selecionarVeiculoDoModal(veiculo));
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Erro ao buscar no modal:", err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro ao carregar veículos.</td></tr>';
    }
}

function selecionarVeiculoDoModal(veiculo) {
    estadoOcorrencia.veiculoId = veiculo.id;
    estadoOcorrencia.prefixo = veiculo.prefixo;

    txtPrefixoOcorrencia.value = veiculo.prefixo || veiculo.placa;
    txtNomeBemOcorrencia.value = veiculo.nome_bem || '';
    
    // Efeito visual de campo travado (readonly) para o nome do bem
    txtNomeBemOcorrencia.classList.add('readonly-field');

    modalVeiculo.style.display = 'none';
    txtKmAtualOcorrencia.focus(); // Pula para o KM
}

// ============================================================================
// 5. FUNÇÕES AUXILIARES
// ============================================================================
function limparTela() {
    estadoOcorrencia = { veiculoId: null, placa: '', prefixo: '' };
    txtNumOcorrencia.value = ''; 
    txtPrefixoOcorrencia.value = '';
    txtNomeBemOcorrencia.value = '';
    txtKmAtualOcorrencia.value = '';
    txtContatoOcorrencia.value = '';
    cboLocaisConstantes.value = '';
    txtDescricaoLocal.value = '';
    txtDefeitoRelatado.value = '';
    txtNumSolicitacaoBRT.value = '';
    preencherDataAbertura();
}

const campoStatus = document.getElementById('txtStatusOcorrencia');
if (campoStatus) {
    campoStatus.value = 'Pendente';
    campoStatus.style.color = '#eab308';
}

function preencherDataAbertura() {
    const hoje = new Date();
    txtDataAbertura.value = hoje.toLocaleDateString('pt-BR');
}

// ============================================================================
// 6. IMPORTAÇÃO AUTOMÁTICA DE S.S METROBUS (PDF / IMAGEM)
// ============================================================================
function configurarImportacaoSS() {
    const btnImportar = document.getElementById('btnImportarSS');
    const inputArquivo = document.getElementById('inputArquivoSS');
    const lblStatus = document.getElementById('lblStatusImportacao');

    if (!btnImportar || !inputArquivo) return;

    btnImportar.addEventListener('click', () => inputArquivo.click());

    inputArquivo.addEventListener('change', async () => {
        const arquivo = inputArquivo.files[0];
        if (!arquivo) return;

        lblStatus.style.color = '#6b7280';
        lblStatus.textContent = `⏳ Lendo "${arquivo.name}"...`;
        btnImportar.disabled = true;

        try {
            const base64 = await lerArquivoComoBase64(arquivo);
            const mimeType = arquivo.type || 'application/pdf';

            const resposta = await fetch(`${API_BASE}/api/extrair-documento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base64, mimeType })
            });

            if (!resposta.ok) {
                const err = await resposta.json();
                throw new Error(err.error || 'Erro no servidor.');
            }

            const dados = await resposta.json();

            // Gera o número da ocorrência automaticamente
            await gerarProximoNumeroOcorrencia();

            // Preenche os campos extraídos
            if (dados.prefixo) {
                txtPrefixoOcorrencia.value = dados.prefixo;
                await buscarVeiculoDireto(dados.prefixo);
            }
            if (dados.km) {
                txtKmAtualOcorrencia.value = dados.km;
            }
            if (dados.defeito) {
                txtDefeitoRelatado.value = dados.defeito;
            }
            if (dados.num_solicitacao_brt) {
                txtNumSolicitacaoBRT.value = dados.num_solicitacao_brt;
            }

            // Locais Constantes fixo para Garagem BRT
            cboLocaisConstantes.value = 'Garagem-BRT';

            lblStatus.style.color = '#22c55e';
            lblStatus.textContent = '✅ Documento importado! Confira os dados e salve.';

        } catch (erro) {
            console.error('Erro na importação:', erro);
            lblStatus.style.color = '#ef4444';
            lblStatus.textContent = `❌ Falha: ${erro.message}`;
        } finally {
            btnImportar.disabled = false;
            inputArquivo.value = '';
        }
    });
}

function lerArquivoComoBase64(arquivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64Completo = e.target.result;
            const base64Puro = base64Completo.split(',')[1];
            resolve(base64Puro);
        };
        reader.onerror = reject;
        reader.readAsDataURL(arquivo);
    });
}