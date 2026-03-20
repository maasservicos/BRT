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
// Função para Formatar Datas

function formatarDataParaBR(dataIso) {
    if (!dataIso) return ''; // Se não tiver data, devolve vazio
    
    const data = new Date(dataIso); // Transforma o texto do banco num objeto de Data
    
    const dataFormatada = data.toLocaleDateString('pt-BR');
    const horaFormatada = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    return `${dataFormatada} ${horaFormatada}`;
}

//1 - Início

let estadoSS = {
    veiculoId: null,          // Guarda o ID (UUID) que virá do banco de dados
    identificacaoBusca: '',   // Guarda a Placa ou Prefixo que o usuário digitou
    sintomas: [],             // Uma lista (Array) vazia para guardarmos os sintomas escolhidos
    isDanoSevero: false,
    editando: false       // Guarda se o botão de Dano Severo foi ativado
};

//2 - Funções do Formulário

document.addEventListener('DOMContentLoaded', () => {
    console.log("Tela de S.S carregada. Iniciando Sistema ...");
    
    preencherDataAbertura();
    configurarEventosNumeroSS();
    configurarEventosBuscaVeiculo();
    configurarEventosModalSintomas();
    configurarEventosBotoesFinais();


    const txtPlacaSS = document.getElementById('txtPlacaSS');
    if (txtPlacaSS) {
        txtPlacaSS.focus();
    }
});

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
                estadoSS.editando = false; // Garante que volta a ser uma S.S. Nova
            }
        });
    }

    if(txtNumSS) {
        // 1. O GATILHO DO TAB / CLICAR FORA (blur)
        // Este é o verdadeiro "motor" de busca automático.
        txtNumSS.addEventListener('blur', () => {
            const numeroDigitado = txtNumSS.value.trim();

            if(numeroDigitado !== '') {
                console.log(`Pesquisando S.S n° ${numeroDigitado} via Tab/Saída...`);
                buscarSSTrazerDados(numeroDigitado); 
            }
        });

        // 2. O GATILHO DO ENTER (keypress)
        txtNumSS.addEventListener('keypress', (evento) => {
            if (evento.key === 'Enter') {
                evento.preventDefault(); // Impede o formulário de fazer reload na página
                
                const numeroDigitado = txtNumSS.value.trim();

                if(numeroDigitado === '') {
                    // Só avisa que está vazio se ele tentar forçar a busca com Enter
                    alert(`Digite um número de S.S para Pesquisar!`);
                } else {
                    // Se tem número, mandamos o JavaScript "tirar o cursor" do campo.
                    // Isso aciona instantaneamente o evento 'blur' aí de cima!
                    txtNumSS.blur(); 
                }
            }
        });
    }
}

// =====================================================================
// ROTINA DE CARREGAMENTO DE S.S. PARA EDIÇÃO/FINALIZAÇÃO
// =====================================================================
async function buscarSSTrazerDados(numero) {
    const txtNumSS = document.getElementById('txtNumSS');
    txtNumSS.style.backgroundColor = '#fef08a'; // Pinta de amarelo para mostrar que está a carregar

    try {
        const { data, error } = await client
            .from('Solicitacao_Servicos')
            .select('*')
            .eq('numero_ss', parseInt(numero));

        if (error) throw error;

        if (data && data.length > 0) {
            const ss = data[0];
            console.log("S.S. encontrada no banco!", ss);
            
            // 1. Liga o "Modo Edição" (Muito Importante!)
            estadoSS.editando = true;

            //Trazer Datas
            const campoAbertura = document.getElementById('txtAberturaSS');
            if (campoAbertura) campoAbertura.value = formatarDataParaBR(ss.data_abertura);

            const campoFechamento = document.getElementById('txtFechamentoSS');
            if (campoFechamento) campoFechamento.value = formatarDataParaBR(ss.data_fechamento);

            // 2. Preenche os campos de texto com os dados do banco
            if (document.getElementById('txtStatusSS')) document.getElementById('txtStatusSS').value = ss.status || ';'
            if (document.getElementById('txtKMSS')) document.getElementById('txtKMSS').value = ss.km_atual || '';
            if (document.getElementById('txtSintomaPrincipal')) document.getElementById('txtSintomaPrincipal').value = ss.sintomas || '';
            if (document.getElementById('txtDescricaoSS')) document.getElementById('txtDescricaoSS').value = ss.defeito_relatado || '';
            if (document.getElementById('txtDescricaoLocalizacaoSS')) document.getElementById('txtDescricaoLocalizacaoSS').value = ss.localizacao_veiculo || '';
          
            // 3. Preenche os Selects
            const selectServico = document.getElementById('cboTipoManutencaoSS'); 
            if (selectServico && ss.servico) selectServico.value = ss.servico;
            
            const selectLocal = document.getElementById('cboLocaisSS'); 
            if (selectLocal && ss.locais_constantes) selectLocal.value = ss.locais_constantes;

            // 3. Preenche os CheckBox

            const chkDano = document.getElementById('chkDanoSevero');
            if (chkDano) chkDano.checked = ss.is_dano_severo || false;

            const chkCliente = document.getElementById('chkClienteEsperando');
            if (chkCliente) chkCliente.checked = ss.is_cliente_esperando || false;
            
            const chkRapido = document.getElementById('chkServicoRapido');
            if (chkRapido) chkRapido.checked = ss.is_servico_rapido || false;

            // 4.Traz os dados do veículo
            if (ss.identificacao_veiculo) {
                buscarVeiculoDireto(ss.identificacao_veiculo);
            }

            alert(`✅ S.S. ${numero} carregada e pronta para ser editada/finalizada!`);
        } else {
            alert(`⚠️ S.S. número ${numero} não existe na base de dados.`);
            txtNumSS.value = ''; // Limpa para ele tentar de novo
        }
    } catch (err) {
        console.error("Erro na busca da S.S:", err);
        alert("❌ Erro ao buscar S.S. na base de dados.");
    } finally {
        txtNumSS.style.backgroundColor = ''; // Remove o amarelo
    }
}

// =====================================================================
// MÓDULO: BUSCA DE VEÍCULO VIA MODAL (CARTÃO 1)
// =====================================================================

function configurarEventosBuscaVeiculo() {
    // Elementos da tela principal
    const btnBuscarPlacaSS = document.getElementById('btnBuscarPlacaSS');

    const txtPlacaPrincipal = document.getElementById('txtPlacaSS'); 

    if (txtPlacaPrincipal) {
        // O evento 'blur' dispara exatamente quando o cursor sai do campo (ex: ao dar Tab)
        txtPlacaPrincipal.addEventListener('blur', () => {
            const termoDigitado = txtPlacaPrincipal.value.trim().replace('-', '');
            
            // Só faz a viagem ao Supabase se o mecânico realmente tiver digitado algo
            if (termoDigitado.length > 0) {
                // Como não sabemos se ele estava só a passar pelo campo, 
                // vamos fazer uma busca "silenciosa" e rápida.
                buscarVeiculoDireto(termoDigitado);
            }
        });

        // Bónus de UX: Se ele der "Enter" no campo principal, forçamos a saída do campo (blur)
        txtPlacaPrincipal.addEventListener('keypress', (evento) => {
            if (evento.key === 'Enter') {
                evento.preventDefault();
                txtPlacaPrincipal.blur(); // Aciona automaticamente a lógica do blur acima!
            }
        });
    }
    
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

// =====================================================================
// BUSCA DIRETA (VIA TAB / BLUR NO CAMPO PRINCIPAL)
// =====================================================================

async function buscarVeiculoDireto(termo) {
    console.log(`A fazer busca rápida por: ${termo}`);
    
    // Podemos mudar a cor do campo rapidamente para indicar que está a carregar
    const txtPlaca = document.getElementById('txtPlaca');

    try {
        const { data, error } = await client
            .from('View_Frota_Completa') 
            .select('*')
            // Busca exata pelo prefixo ou placa (.eq significa "equal/igual")
            .or(`prefixo.eq.${termo},placa.ilike.${termo}`)
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            const veiculo = data[0];
            console.log("Veículo encontrado na via rápida!");
            
            // Reaproveitamos a função que já criámos! 
            // Ela preenche os campos, bloqueia a edição e joga o cursor para o Defeito.
            selecionarVeiculoDoModal(veiculo); 

        } else {
            // Se ele digitar um prefixo fantasma e der Tab, limpamos o erro e avisamos.
            alert('⚠️ Veículo não encontrado. Verifique o Prefixo digitado ou use a Lupa para pesquisar na lista.');
            txtPlaca.value = ''; // Limpa o erro
            
            // Desbloqueia caso tenha ficado bloqueado de uma tentativa anterior
            txtPlaca.removeAttribute('readonly'); 
            txtPlaca.classList.remove('readonly-field');
            
            // Espera uns milissegundos e devolve o cursor para ele corrigir
            setTimeout(() => txtPlaca.focus(), 100); 
        }

    } catch (err) {
        console.error("Erro na busca direta:", err);
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
                <td>${veiculo.nome_bem || '-'} </td>
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
    preencherCampo('txtPlacaSS', veiculo.prefixo);
    preencherEBloquearCampo('txtNomeBemSS', veiculo.nome_bem);
    preencherEBloquearCampo('txtStatusSS', veiculo.status);
    preencherEBloquearCampo('txtNumContratoSS', veiculo.contrato_cod);
    preencherEBloquearCampo('txtNomeContratoSS', veiculo.contrato_desc);

    // 3. Fecha o modal
    document.getElementById('modalBuscaVeiculo').style.display = 'none';

    // 4. Pula o cursor para o defeito relatado
    document.getElementById('txtDefeito')?.focus();
}

function preencherEBloquearCampo(idElemento, valor) {
    const campo = document.getElementById(idElemento);

    if (campo) {
        campo.value = valor || '';
        campo.setAttribute('readonly', true);
        campo.classList.add('readonly-field');
    } else {
        console.warn(`Atenção: O campo com ID '${idElemento}' não foi encontrado no HTML.` );
    }
}

function preencherCampo(idElemento, valor) {
    const campo = document.getElementById(idElemento);

    if (campo) {
        campo.value = valor || '';
    } else {
        console.warn(`Atenção: O campo com ID '${idElemento}' não foi encontrado no HTML.` );
    }
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

    const campoStatus = document.getElementById('txtStatusSS');
    if (campoStatus) {
        campoStatus.style.color = '#3b82f6'; // 
    }

    if (document.getElementById('txtPlacaSS')) document.getElementById('txtPlacaSS').value = '';
    
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


/// =====================================================================
// MÓDULO: MODAL DE SINTOMAS EM TABELA COM BUSCA (CARTÃO 3)
// =====================================================================

function configurarEventosModalSintomas() {
    // 1. Mapeamento de IDs exatos do seu novo HTML
    const btnLupaSintoma = document.getElementById('btnLupaSintoma'); 
    const modalSintomas = document.getElementById('modalSintomas');
    const tbodySintomas = document.getElementById('listaBuscaSintomasModal');
    const txtBuscaSintoma = document.getElementById('txtBuscaSintomaModal'); 
    const txtSintomaPrincipal = document.getElementById('txtSintomaPrincipal'); 
    
    // Botões
    const btnFechar = document.getElementById('btnFecharModalSintomas');
    const btnCancelar = document.getElementById('btnCancelarSintomas');
    const btnConfirmar = document.getElementById('btnConfirmarSintomaModal');
    console.log("3. Encontrei o botão da lupa?", !!btnLupaSintoma);
    console.log("4. Encontrei o modal?", !!modalSintomas);

    if (!modalSintomas) {
        console.warn("⚠️ ALERTA: Não achei o modal, abortando a função!");
        return;
    }

    // -----------------------------------------------------------------
    // ABRIR O MODAL E CARREGAR DADOS (LAZY LOADING)
    // -----------------------------------------------------------------
  if (btnLupaSintoma) {
        btnLupaSintoma.addEventListener('click', () => {
            console.log("5. CLICOU NA LUPA! A abrir o modal..."); // Radar 3
            
            modalSintomas.classList.remove('hidden');
            
            // CORREÇÃO: Usando o nome correto da variável
            if (txtBuscaSintoma) {
                txtBuscaSintoma.value = ''; 
                txtBuscaSintoma.focus();
            }
            
            if (tbodySintomas && tbodySintomas.innerHTML.includes('Carregando')) {
                buscarSintomasNoSupabase();
            } else {
                filtrarTabela(''); 
            }
        });
    }

    // -----------------------------------------------------------------
    // FECHAR O MODAL
    // -----------------------------------------------------------------
    const fecharModal = () => modalSintomas.classList.add('hidden');
    if (btnFechar) btnFechar.addEventListener('click', fecharModal);
    if (btnCancelar) btnCancelar.addEventListener('click', fecharModal);

    // -----------------------------------------------------------------
    // FILTRO EM TEMPO REAL
    // -----------------------------------------------------------------
    if (txtBuscaSintoma) {
        txtBuscaSintoma.addEventListener('input', (evento) => {
            const termo = evento.target.value.toLowerCase().trim();
            filtrarTabela(termo);
        });
    }

    function filtrarTabela(termo) {
        if (!tbodySintomas) return;
        const linhas = tbodySintomas.querySelectorAll('tr');
        linhas.forEach(tr => {
            if (tr.querySelector('td[colspan]')) return; 
            const textoLinha = tr.textContent.toLowerCase();
            tr.style.display = textoLinha.includes(termo) ? '' : 'none';
        });
    }

    // -----------------------------------------------------------------
    // CONFIRMAR SELEÇÃO E TRANSFERIR PARA A TELA
    // -----------------------------------------------------------------

    if (btnConfirmar && txtSintomaPrincipal) { 
        btnConfirmar.addEventListener('click', () => {
            const linhasSelecionadas = tbodySintomas.querySelectorAll('.sintoma-selecionado');
            let sintomasEscolhidos = [];

            linhasSelecionadas.forEach(tr => {
                sintomasEscolhidos.push(tr.dataset.descricao);
                tr.classList.remove('sintoma-selecionado');
                tr.style.backgroundColor = ''; 
            });

            if (sintomasEscolhidos.length > 0) {
                const textoFinal = sintomasEscolhidos.join(', ');
                
                // CORREÇÃO: Injeta no campo correto
                if (txtSintomaPrincipal.value.trim() !== '') {
                    txtSintomaPrincipal.value += ', ' + textoFinal;
                } else {
                    txtSintomaPrincipal.value = textoFinal;
                }
            }

            fecharModal();
            // Joga o cursor de volta para o campo para o mecânico continuar
            txtSintomaPrincipal.focus(); 
        });
    }
}

// =====================================================================
// BUSCA NO SUPABASE E DESENHO DA TABELA DE SINTOMAS
// =====================================================================
async function buscarSintomasNoSupabase() {
    const tbody = document.getElementById('listaBuscaSintomasModal');
    
    try {
        // Vai ao banco buscar os sintomas e ordena por ordem alfabética
        const { data, error } = await client
            .from('sintomas') // Confirme se o nome da tabela no Supabase é este mesmo
            .select('*')
            .order('codigo', { ascending: true });

        if (error) throw error;

        tbody.innerHTML = ''; // Limpa a mensagem de "Carregando..."

        // Se o banco estiver vazio...
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center p-15">Nenhum sintoma cadastrado.</td></tr>';
            return;
        }

        // Desenha as linhas clicáveis com os dados do banco
        data.forEach(sintoma => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer'; 
            tr.dataset.descricao = sintoma.descricao; 

            tr.innerHTML = `
                <td style="width: 80px;" class="text-center">${sintoma.codigo || sintoma.id || '-'}</td>
                <td>${sintoma.descricao}</td>
            `;

            // O GATILHO DE SELEÇÃO (Muda a cor da linha ao clicar)
            tr.addEventListener('click', () => {
                tr.classList.toggle('sintoma-selecionado');
                
                if (tr.classList.contains('sintoma-selecionado')) {
                    tr.style.backgroundColor = '#fed7aa'; // Fica laranjinha
                } else {
                    tr.style.backgroundColor = ''; // Volta ao branco
                }
            });

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Erro ao buscar sintomas:", err);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center text-danger p-15">Erro ao carregar os dados.</td></tr>';
        }
    }
}

// =====================================================================
// MÓDULO: SALVAR E FINALIZAR S.S. (GRAVAÇÃO NO BANCO)
// =====================================================================

function configurarEventosBotoesFinais() {
    const btnGravarSS = document.getElementById('btnGravarSS');       // Ajuste o ID se necessário
    const btnFinalizarSS = document.getElementById('btnFinalizarSS'); // Ajuste o ID se necessário

    if (btnGravarSS) {
        btnGravarSS.addEventListener('click', (e) => {
            e.preventDefault();
            processarSalvamento('ABERTA'); // Status Aberta
        });
    }

    if (btnFinalizarSS) {
        btnFinalizarSS.addEventListener('click', (e) => {
            e.preventDefault();
            processarSalvamento('FINALIZADA'); // Status Finalizada
        });
    }
}

async function processarSalvamento(statusSS) {
    // 1. Coleta de Dados da Tela
    const numeroSS = document.getElementById('txtNumSS')?.value || '';
    const prefixoOuPlaca = document.getElementById('txtPlacaSS')?.value || '';
    const kmAtual = document.getElementById('txtKMSS')?.value || '';
    const sintomaPrincipal = document.getElementById('txtSintomaPrincipal')?.value || '';
    const defeitoRelatado = document.getElementById('txtDescricaoSS')?.value || '';
    const localizacaoVeiculo = document.getElementById('txtDescricaoLocalizacaoSS')?.value || '';
    const tipoServico = document.getElementById('cboTipoManutencaoSS')?.value;
    const locaisConstantes = document.getElementById('cboLocaisSS')?.value;
    const danoSevero = document.getElementById('chkDanoSevero')?. value || '';
    const servicoRapido = document.getElementById('chkServicoRapido')?. value || '';
    const clienteEsperando = document.getElementById('chkClienteEsperando')?. value || '';
    const statusSolicitacao = document.getElementById('txtStatusSS')?.value;

    // 2. Validação Inteligente
    if (!prefixoOuPlaca) {
        alert('⚠️ É obrigatório informar o Veículo (Prefixo/Placa) antes de salvar.');
        return;
    }

    // Se for FINALIZAR, somos mais rigorosos!
    if (statusSS === 'FINALIZADA') {
        if (!sintomaPrincipal && !defeitoRelatado && !localizacaoVeiculo) {
            alert('⚠️ Para FINALIZAR a S.S., você precisa informar o Sintoma, Defeito Relatado e Localização do Veículo.');
            return;
        }
    }

    // 3. Montagem do Pacote (Payload) para o Supabase
    // ATENÇÃO: As chaves (esquerda) DEVEM ter o mesmo nome das colunas da sua tabela no banco
    const pacoteSS = {
        numero_ss: numeroSS,
        identificacao_veiculo: prefixoOuPlaca,
        km_atual: kmAtual ? parseInt(kmAtual) : null,
        sintomas: sintomaPrincipal,
        defeito_relatado: defeitoRelatado,
        servico: tipoServico,
        status: statusSolicitacao,
        localizacao_veiculo: localizacaoVeiculo,
        locais_constantes: locaisConstantes,
        is_dano_severo: danoSevero,
        is_servico_rapido: servicoRapido,
        is_cliente_esperando: clienteEsperando,
  
        
    };

    const momentoAtual = new Date().toISOString();

    if(!estadoSS.editando) {
        pacoteSS.data_abertura = momentoAtual;
    }
    if (statusSS === 'FINALIZADA') {
        pacoteSS.data_fechamento = momentoAtual;
    }
    if (statusSS === 'FINALIZADA') {
        const campoFechamento = document.getElementById('txtFechamentoSS');
        if (campoFechamento) {
            const agora = new Date();
           campoFechamento.value = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
    }

    // 4. Feedback Visual (UX)
    const btnClicado = statusSS === 'FINALIZADA' ? document.getElementById('btnFinalizarSS') : document.getElementById('btnGravarSS');
    const textoOriginal = btnClicado.innerText;
    btnClicado.innerText = 'A gravar... ⏳';
    btnClicado.disabled = true;

   // 5. Envio para o Supabase (O DESVIO INTELIGENTE UPDATE vs INSERT)
    try {
        console.log("Pacote pronto para envio:", pacoteSS);

        // Se pesquisámos a S.S. antes, a memória 'editando' estará verdadeira!
        if (estadoSS.editando) {
            console.log("A atualizar S.S. existente no banco...");
            
            const { error } = await client
                .from('Solicitacao_Servicos')
                .update(pacoteSS)
                .eq('numero_ss', pacoteSS.numero_ss); // Encontra a linha pelo número da S.S.

            if (error) throw error;
        } 
        // Se for falso, é uma S.S. Nova!
        else {
            console.log("A criar S.S. nova...");
            const { error } = await client
                .from('Solicitacao_Servicos')
                .insert([pacoteSS]);

            if (error) throw error;
        }

        // 6. Sucesso!
        alert(`✅ S.S. ${statusSS} com sucesso!`);
        window.location.reload(); 

    } catch (err) {
        console.error("Erro ao salvar S.S.:", err);
        alert('❌ Ocorreu um erro ao comunicar com a base de dados. Tente novamente.');
    } finally {
        // Restaura o botão
        btnClicado.innerText = textoOriginal;
        btnClicado.disabled = false;
    }
}