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

//1 - Início

let estadoSS = {
    veiculoId: null,          // Guarda o ID (UUID) que virá do banco de dados
    identificacaoBusca: '',   // Guarda a Placa ou Prefixo que o usuário digitou
    sintomas: [],             // Uma lista (Array) vazia para guardarmos os sintomas escolhidos
    isDanoSevero: false       // Guarda se o botão de Dano Severo foi ativado
};

//2 - Funções do Formulário

document.addEventListener('DOMContentLoaded', () => {
    console.log("Tela de S.S carregada. Iniciando Sistema ...");
    
    preencherDataAbertura();
    configurarEventosNumeroSS();
    configurarEventosBuscaVeiculo();


    const txtPlacaSS = document.getElementById('txtPlacaSS');
    if (txtPlacaSS) {
        txtPlacaSS.focus();
    }
});

//3 - Funções de UI

// 3. FUNÇÕES DE INTERFACE (UI)

function preencherDataAbertura() {
    // 1. Vai no HTML e pega o campo de texto pelo ID dele
    const txtAbertura = document.getElementById('txtAberturaSS'); // Atenção: Verifique se o ID no seu HTML é esse mesmo
    
    // Se o campo não existir, para a função aqui mesmo (return)
    if (!txtAbertura) return;

    // 2. Cria um objeto com a data e hora exata deste milissegundo
    const agora = new Date();
    
    // 3. Formata para o padrão Brasileiro (DD/MM/AAAA)
    const dataFormatada = agora.toLocaleDateString('pt-BR');
    
    // 4. Formata a hora (HH:MM)
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // 5. Injeta o texto montado dentro do campo
    txtAbertura.value = `${dataFormatada} ${horaFormatada}`;
}

// Card 1 - Informações da S.S e Véiculos //
function configurarEventosNumeroSS () {
    const txtNumSS = document.getElementById('txtNumSS');
    const btnNovaSS = document.getElementById('btnNovaSS');

    if(btnNovaSS) {
        btnNovaSS.addEventListener('click' , () => {
            const confirmar = confirm('Ao iniciar nova S.S os dados preenchidos serão apagados, deseja continuar?');

            if (confirmar) {
                limparFormularioSS();
            }
        });
    }

    if(txtNumSS) {
        txtNumSS.addEventListener('keypress', (evento) => {
            if (evento.key === 'Enter') {
                const numeroDigitado = txtNumSS.value.trim();

                if(numeroDigitado !== '') {
                    console.log(`Pesquisando S.S n° &{numeroDigitado}...`);

                alert(`Simulando busca da S.S ${numeroDigitado} no banco`);
                } else {
                    alert(`Digite um número de S.S para Pesquisar!`);
                }
            }
        });
    }
}

// =====================================================================
// MÓDULO: BUSCA DE VEÍCULO VIA MODAL (CARTÃO 1)
// =====================================================================

function configurarEventosBuscaVeiculo() {
    // Elementos da tela principal
    const btnBuscarPlacaSS = document.getElementById('btnBuscarPlacaSS');
    
    // Elementos do Modal
    const modalVeiculo = document.getElementById('modalBuscaVeiculo');
    const btnFecharModal = document.getElementById('btnFecharModalVeiculo');
    const txtPesquisaModal = document.getElementById('txtPesquisaModalVeiculo');

    if (!btnBuscarPlacaSS || !modalVeiculo) return;

    // 1. ABRIR O MODAL: Quando clica na lupa da tela principal
    btnBuscarPlacaSS.addEventListener('click', () => {
        modalVeiculo.style.display = 'flex'; // Mostra o modal
        txtPesquisaModal.value = ''; // Limpa pesquisas antigas
        txtPesquisaModal.focus(); // Foca o cursor para o mecânico já ir digitando
        
        
        buscarVeiculosNoModal(''); 
    });

    // 2. FECHAR O MODAL: No botão "X"
    btnFecharModal.addEventListener('click', () => {
        modalVeiculo.style.display = 'none';
    });

    // 3. PESQUISAR AO DIGITAR: O evento 'input' dispara a cada letra que ele digita!
    if (txtPesquisaModal) {
        txtPesquisaModal.addEventListener('input', (evento) => {
            const termo = evento.target.value.trim();
            // Só pesquisa se tiver 2 ou mais letras, para não sobrecarregar o Supabase
            if (termo.length >= 2 || termo === '') {
                buscarVeiculosNoModal(termo);
            }
        });
    }
}

// ---------------------------------------------------------------------
// A FUNÇÃO QUE VAI AO SUPABASE E DESENHA A TABELA
// ---------------------------------------------------------------------
async function buscarVeiculosNoModal(termo) {
    const tbody = document.getElementById('tabelaResultadosVeiculos');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">⏳ Buscando veículos...</td></tr>';

    try {
      // NOVA LINHA (Traz todos e ordena pelo prefixo):
let query = client.from('View_Frota_Completa').select('*').order('prefixo', { ascending: true });
       
        if (termo !== '') {
            query = query.or(`placa.ilike.%${termo}%,prefixo.ilike.%${termo}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Limpa a tabela para colocar os resultados novos
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum veículo encontrado.</td></tr>';
            return;
        }

        // Desenha uma linha (<tr>) para cada veículo encontrado
        data.forEach(veiculo => {
            const tr = document.createElement('tr');
            
            // Aqui usamos crases (Template Strings) para injetar variáveis no HTML
            tr.innerHTML = `
                <td>${veiculo.prefixo || '-'}</td>
                <td>${veiculo.placa || '-'}</td>
                <td> ${veiculo.nome_bem || '-'} </td>
                <td>
                    <button class="btn-selecionar-veiculo" style="cursor: pointer; padding: 4px 8px; background: #22c55e; color: white; border: none; border-radius: 4px;">
                        Selecionar
                    </button>
                </td>
            `;

            // A MÁGICA FINAL: O que acontece quando ele clica no botão verde "Selecionar" daquela linha
            const btnSelecionar = tr.querySelector('.btn-selecionar-veiculo');
            btnSelecionar.addEventListener('click', () => selecionarVeiculoDoModal(veiculo));

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Erro ao buscar no modal:", err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro ao carregar veículos.</td></tr>';
    }
}

// ---------------------------------------------------------------------
// A FUNÇÃO QUE TRANSFERE OS DADOS DO MODAL PARA A TELA PRINCIPAL
// ---------------------------------------------------------------------
function selecionarVeiculoDoModal(veiculo) {
    console.log("Veículo selecionado:", veiculo);

    // 1. Guarda na memória
    estadoSS.veiculoId = veiculo.id;
    estadoSS.identificacaoBusca = veiculo.placa || veiculo.prefixo;

    // 2. Preenche os campos da tela de trás (A tela principal)
    // Usamos a mesma função DRY que criamos antes!
    preencherEBloquearCampo('txtPlacaSS', veiculo.placa || veiculo.prefixo);
    preencherEBloquearCampo('txtNomeBemSS', veiculo.nome_bem);
    preencherEBloquearCampo('txtTipoOnibusSS', veiculo.tipo);
    preencherEBloquearCampo('txtKmAtual', veiculo.km_atual);

    // 3. Fecha o modal
    document.getElementById('modalBuscaVeiculo').style.display = 'none';

    // 4. Pula o cursor para o defeito relatado
    document.getElementById('txtDefeito')?.focus();
}

/* Limpar Formulario quando for gerar uma nova S.S*/
function limparFormularioSS() {
    // 1. Zera a Memória (Estado Global)
    estadoSS = {
        veiculoId: null,
        identificacaoBusca: '',
        sintomas: [],
        isDanoSevero: false
    };

    // 2. Zera os campos visuais principais (Pode adicionar os outros depois)
    gerarProximoNumeroSS();
    if (document.getElementById('txtPlacaSS')) document.getElementById('txtPlacaSS').value = '';
    if (document.getElementById('txtNomeBem')) document.getElementById('txtNomeBem').value = '';
    if (document.getElementById('txtTipoOnibus')) document.getElementById('txtTipoOnibus').value = '';
    if (document.getElementById('txtKmAtual')) document.getElementById('txtKmAtual').value = '';
    if (document.getElementById('txtDefeito')) document.getElementById('txtDefeito').value = '';
    
    // 3. Atualiza a Data de Abertura para o segundo exato em que ele clicou em "Novo"
    preencherDataAbertura();
    
    // 4. Coloca o cursor a piscar na Placa para ele começar a trabalhar
    const txtPlaca = document.getElementById('txtPlaca');
    if (txtPlaca) txtPlaca.focus();
    
    console.log("Ecrã limpo. Pronto para nova S.S.");
}

// ==========================================
// FUNÇÕES DE BASE DE DADOS (SUPABASE)
// ==========================================

/**
 * Vai na base de dados, descobre qual é a última S.S. criada e prevê a próxima.
 */
async function gerarProximoNumeroSS() {
    const txtNumSS = document.getElementById('txtNumSS');
    if (!txtNumSS) return;

    // Coloca um aviso visual enquanto a base de dados pensa
    txtNumSS.value = 'Gerando...';

    try {
        // 1. A Consulta Inteligente: 
        // "Supabase, traz-me apenas a coluna 'numero_ss', ordena do maior para o menor, e traz só 1."
        const { data, error } = await client
            .from('Solicitacao_Servicos') // Verifique se o nome da tabela está exato
            .select('numero_ss')
            .order('numero_ss', { ascending: false })
            .limit(1);

        if (error) throw error;

        // 2. A Matemática
        let proximoNumero = 1; // Se a tabela estiver vazia, começamos no 1

        if (data && data.length > 0 && data[0].numero_ss) {
            proximoNumero = data[0].numero_ss + 1; // Pega no último e soma 1
        }

        // 3. Exibe no ecrã e bloqueia o campo
        txtNumSS.value = proximoNumero;
        
        // Bloqueia o campo para garantir que o utilizador não apaga o número do sistema
        txtNumSS.setAttribute('readonly', true);
        txtNumSS.classList.add('readonly-field'); // Aquela classe do nosso CSS que deixa cinzento

    } catch (err) {
        console.error("Erro ao gerar o próximo número da S.S.:", err);
        // Em caso de falha de internet, não travamos o sistema. Colocamos "NOVA"
        txtNumSS.value = '';
        txtNumSS.setAttribute('readonly', true);
        txtNumSS.classList.add('readonly-field');
    }
}