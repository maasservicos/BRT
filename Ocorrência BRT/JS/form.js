import { client } from './supabaseClient.js';

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
const formOcorrencia = document.querySelector('form');

// Elementos do Modal
const modalVeiculo = document.getElementById('modalBuscaVeiculo');
const btnFecharModal = document.getElementById('btnFecharModalVeiculo');
const txtPesquisaModal = document.getElementById('txtPesquisaModalVeiculo');

// Inicia os eventos quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    configurarEventosOcorrencia();
    configurarEventosBuscaVeiculo();
    preencherDataAbertura();
});

// ============================================================================
// 2. EVENTOS DA TELA PRINCIPAL
// ============================================================================

async function gerarProximoNumeroOcorrencia() {
    try {
        // Vai no Supabase, ordena do maior para o menor e pega só o primeiro (o maior ID)
        const { data, error } = await client
            .from('Ocorrencia') // Nome da sua tabela
            .select('num_ocorrencia') // Nome da sua coluna de ID
            .order('num_ocorrencia', { ascending: false })
            .limit(1);

        if (error) throw error;

        let proximoId = 1; // Se o banco estiver totalmente vazio, ele começa no 1
        
        if (data && data.length > 0) {
            // Pega o último número que achou e soma 1
            proximoId = data[0].num_ocorrencia + 1; 
        }

        const campoStatus = document.getElementById('txtStatusOcorrencia');
        if (campoStatus) {
            campoStatus.value = data.status || 'Pendente';

    // Perfumaria de UX: Mudar a cor conforme o status
        if (data.status === 'Pendente') campoStatus.style.color = '#eab308'; // Amarelo
        if (data.status === 'Em Andamento') campoStatus.style.color = '#3b82f6'; // Azul
        if (data.status === 'Finalizada') campoStatus.style.color = '#22c55e'; // Verde
}
        // Preenche o campo na tela com o novo número
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
                .from('Ocorrencia') // Confirme se o nome da tabela no Supabase é minúsculo
                .select('*')
                .eq('num_ocorrencia', idDigitado) // Confirme o nome da coluna de ID
                .single();

            if (error) throw error;

            if (data) {
                txtPrefixoOcorrencia.value = data.prefixo_veiculo || '';
                txtKmAtualOcorrencia.value = data.km_atual || '';
                txtContatoOcorrencia.value = data.contato || '';
                cboLocaisConstantes.value = data.locais_constantes || '';
                txtDescricaoLocal.value = data.descricao_local || '';
                txtDefeitoRelatado.value = data.defeito_relatado || '';
                
                // Formata e exibe a data que veio do banco
                if(data.data_abertura) {
                    const dataObj = new Date(data.data_abertura);
                    txtDataAbertura.value = dataObj.toLocaleDateString('pt-BR');
                }

                // Busca o nome do bem para deixar a tela bonita
                if (data.prefixo_veiculo) buscarVeiculoDireto(data.prefixo_veiculo);
                
                console.log("Ocorrência carregada com sucesso!");
            }
        } catch (err) {
            console.error(err);
            alert('Ocorrência não encontrada no banco de dados!');
            limparTela();
        }
    });

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
            data_abertura: new Date().toISOString(), // Grava a data/hora exata do clique
            status: 'Pendente'
            
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
    preencherDataAbertura();
}

const campoStatus = document.getElementById('txtStatusOcorrencia');
if (campoStatus) {
    campoStatus.value = 'Pendente';
    campoStatus.style.color = '#eab308';
}

function preencherDataAbertura() {
    const hoje = new Date();
    // Preenche o campo de data com DD/MM/AAAA para ficar amigável na tela
    txtDataAbertura.value = hoje.toLocaleDateString('pt-BR');
}