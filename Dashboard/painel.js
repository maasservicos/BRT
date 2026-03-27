import { client } from './supabaseClient.js';

// 🔒 PROTEÇÃO DE ACESSO
const crachaString = localStorage.getItem('maas_usuario_logado');
const usuarioLogado = crachaString ? JSON.parse(crachaString) : null;

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

    // Filtro de Busca na Tabela
    document.getElementById('txtBuscaFiltro')?.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        filtrarTabela(termo);
    });

    carregarDadosDashboard();
});

async function carregarDadosDashboard() {
    try {
        // Busca O.S. que não estão fechadas (foco em quem está em manutenção)
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
            .neq('status', 'FECHADA')
            .order('data_abertura', { ascending: false });

        if (error) throw error;
        renderizarTabela(ordens);
    } catch (err) {
        console.error("Erro Dashboard:", err);
    }
}

function renderizarTabela(ordens) {
    const tbody = document.getElementById('tbodyDashboard');
    tbody.innerHTML = "";

    let abertas = 0, validacao = 0, externa = 0;

    ordens.forEach(os => {
        if (os.status === 'ABERTA') abertas++;
        if (os.status === 'VALIDACAO') validacao++;

        // Verifica se há algum encaminhamento externo aberto
        const encsExternos = os.OS_Encaminhamentos?.filter(e => e.servico_externo && e.status_enc !== 'CONCLUIDO');
        const ehExterno = encsExternos?.length > 0;
        if (ehExterno) externa++;

        const dataBr = new Date(os.data_abertura).toLocaleDateString('pt-BR');
        const statusCor = os.status === 'VALIDACAO' ? '#f59e0b' : '#22c55e';
        
        // Localização dinâmica
        const localTexto = ehExterno 
            ? `<span style="color: #ef4444; font-weight: bold;">🚨 EXTERNA (${encsExternos[0].cod_fornecedor})</span>` 
            : "🏠 Oficina Interna";

        tbody.innerHTML += `
            <tr class="linha-os">
                <td style="padding: 12px;"><strong>${String(os.numero_sequencial).padStart(6, '0')}</strong></td>
                <td style="padding: 12px;">${os.prefixo_veiculo}</td>
                <td style="padding: 12px;">${dataBr}</td>
                <td style="padding: 12px; color: ${statusCor}; font-weight: bold;">${os.status}</td>
                <td style="padding: 12px;">${localTexto}</td>
            </tr>
        `;
    });

    document.getElementById('kpiAbertas').innerText = abertas;
    document.getElementById('kpiValidacao').innerText = validacao;
    document.getElementById('kpiExterna').innerText = externa;
}

function filtrarTabela(termo) {
    const linhas = document.querySelectorAll('.linha-os');
    linhas.forEach(linha => {
        const texto = linha.innerText.toLowerCase();
        linha.style.display = texto.includes(termo) ? '' : 'none';
    });
}