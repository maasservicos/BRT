import { client } from './supabaseClient.js';

// 🔒 PROTEÇÃO DE ACESSO
const crachaString = localStorage.getItem('maas_usuario_logado');
const usuarioLogado = crachaString ? JSON.parse(crachaString) : null;

// Variável global para armazenar os dados brutos do banco
let dadosGlobais = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!usuarioLogado) {
        window.location.href = "../index.html";
        return;
    }

    // Nome no Topo
    const lblNome = document.getElementById('lblNomeUsuario');
    if (lblNome) lblNome.innerText = `👤 Olá, ${usuarioLogado.nome}`;

    // Logout
    document.getElementById('btnSair')?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('maas_usuario_logado');
        window.location.href = "../index.html";
    });

    // Filtro de Busca por Texto (Input)
    document.getElementById('txtBuscaFiltro')?.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        filtrarTabelaPorTexto(termo);
    });

    // 🚀 EVENTOS DE CLIQUE NOS KPIs (Filtro por Status)
    document.getElementById('kpiAbertas')?.parentElement.addEventListener('click', () => filtrarPorStatus('ABERTA'));
    document.getElementById('kpiValidacao')?.parentElement.addEventListener('click', () => filtrarPorStatus('VALIDACAO'));
    document.getElementById('kpiFechadas')?.parentElement.addEventListener('click', () => filtrarPorStatus('FECHADA'));
    // Opcional: clique no título "Monitoramento" para resetar e ver todos
    document.querySelector('.card-title')?.addEventListener('click', () => renderizarTabela(dadosGlobais));

    carregarDadosDashboard();
});

async function carregarDadosDashboard() {
    try {
        const { data: ordens, error } = await client
            .from('Ordens_Servico')
            .select(`
                *,
                OS_Encaminhamentos (
                    servico_externo,
                    status_enc,
                    cod_fornecedor
                )
            `)
            .order('data_abertura', { ascending: false });

        if (error) throw error;
        
        dadosGlobais = ordens; // Guarda os dados para os filtros funcionarem sem nova consulta
        atualizarNumerosKPI(ordens); // Apenas atualiza os números no topo
        filtrarPorStatus('ABERTA'); // Inicia mostrando apenas as abertas (ou mude para mostrar todas)
        
    } catch (err) {
        console.error("Erro Dashboard:", err);
    }
}

// 🚀 FUNÇÃO NOVA: Atualiza apenas os números dos cards
function atualizarNumerosKPI(ordens) {
    let abertas = ordens.filter(os => os.status === 'ABERTA').length;
    let validacao = ordens.filter(os => os.status === 'VALIDACAO').length;
    let fechadas = ordens.filter(os => os.status === 'FECHADA').length;
    
    // Conta externas (apenas de O.S que não estão fechadas)
    let externas = ordens.filter(os => 
        os.status !== 'FECHADA' && 
        os.OS_Encaminhamentos?.some(e => e.servico_externo && e.status_enc !== 'CONCLUIDO')
    ).length;

    document.getElementById('kpiAbertas').innerText = abertas;
    document.getElementById('kpiValidacao').innerText = validacao;
    document.getElementById('kpiFechadas').innerText = fechadas;
    document.getElementById('kpiExterna').innerText = externas;
}

// 🚀 FUNÇÃO NOVA: Filtra os dados globais e manda renderizar
function filtrarPorStatus(statusDesejado) {
    const dadosFiltrados = dadosGlobais.filter(os => os.status === statusDesejado);
    renderizarTabela(dadosFiltrados, statusDesejado);
}

function renderizarTabela(lista, statusAtual = "FILTRADO") {
    const tbody = document.getElementById('tbodyDashboard');
    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhuma O.S. encontrada para este status.</td></tr>`;
        return;
    }

    lista.forEach(os => {
        const dataBr = new Date(os.data_abertura).toLocaleDateString('pt-BR');
        
        // Cores de Status
        let statusCor = '#22c55e'; 
        if (os.status === 'VALIDACAO') statusCor = '#f59e0b'; 
        if (os.status === 'FECHADA') statusCor = '#000000'; 

        const encsExternos = os.OS_Encaminhamentos?.filter(e => e.servico_externo && e.status_enc !== 'CONCLUIDO');
        const ehExterno = encsExternos?.length > 0;
        const localTexto = ehExterno 
            ? `<span style="color: #ef4444; font-weight: bold;">🚨 EXTERNA (${encsExternos[0].cod_fornecedor})</span>` 
            : "🏠 Oficina Interna";

        // 🚀 O SEGREDO: Criar o elemento TR antes de colocar o HTML
        const tr = document.createElement('tr');
        tr.className = 'linha-os-clicavel'; // Nova classe para o CSS
        
        tr.innerHTML = `
            <td style="padding: 12px;"><strong>${String(os.numero_sequencial).padStart(6, '0')}</strong></td>
            <td style="padding: 12px;">${os.prefixo_veiculo}</td>
            <td style="padding: 12px;">${dataBr}</td>
            <td style="padding: 12px;">${os.defeito_relatado || ''}</td>
            <td style="padding: 12px; color: ${statusCor}; font-weight: bold;">${os.status}</td>
            <td style="padding: 12px;">${localTexto}</td>
        `;

        // 🚀 ADICIONANDO O CLIQUE REAL
        tr.addEventListener('click', () => {
            console.log("Clicou na OS:", os.numero_sequencial);
            localStorage.setItem('os_para_pesquisar', os.numero_sequencial);
            window.location.href = "../Controle de O.S/ordemdeservico.html"; 
        });

        tbody.appendChild(tr);
    });
}
function filtrarTabelaPorTexto(termo) {
    const linhas = document.querySelectorAll('.linha-os');
    linhas.forEach(linha => {
        const texto = linha.innerText.toLowerCase();
        linha.style.display = texto.includes(termo) ? '' : 'none';
    });
}