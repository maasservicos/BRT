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