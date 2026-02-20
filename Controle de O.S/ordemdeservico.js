import { client } from './supabaseClient.js';

// ==========================================
// MÓDULO 1: REGISTRO DA O.S E MÁQUINA DE ESTADO
// ==========================================

// Variável Global de "Humor" da Tela
let modoAtual = "PESQUISA";

// Função da Máquina do Tempo (Fuso de Brasília)
function obterDataeHoraAtual() {
    const agora = new Date();
    agora.setHours(agora.getHours() - 3);
    return agora.toISOString().slice(0, 16);
}

// O Ligar da Tela
window.onload = function () {
    const campoDataAbertura = document.getElementById('txtDataAbertura');
    const campoDataFechamento = document.getElementById('txtDataFechamento');
    const lblResumoOS = document.getElementById('lblResumoOS');

    if (campoDataAbertura) campoDataAbertura.value = obterDataeHoraAtual();
    if (campoDataFechamento) campoDataFechamento.value = ""; // Nasce trancado e vazio
    if (lblResumoOS) lblResumoOS.innerText = "—";
};

// ==========================================
// MÓDULO 1.1: BOTÃO CRIAR NOVA O.S
// ==========================================
const btnNovaOS = document.getElementById('btnNovaOS');
const txtNumOS = document.getElementById('txtNumOS');
const lblResumoOS = document.getElementById('lblResumoOS');
const lblStatus = document.getElementById('lblStatus');

if (btnNovaOS && txtNumOS) {
    btnNovaOS.addEventListener('click', function() {
        modoAtual = "CRIAR";
        
        // Tranca a prancheta
        txtNumOS.value = "GERADO AO SALVAR";
        txtNumOS.classList.add('readonly-field');
        txtNumOS.readOnly = true;
        
        // Atualiza a interface
        if (lblResumoOS) lblResumoOS.innerText = "Nova (Automática)";
        if (lblStatus) {
            lblStatus.innerText = "ABERTA";
            lblStatus.className = "badge badge-success";
        }
        
        // Atualiza a hora para o momento do clique
        document.getElementById('txtDataAbertura').value = obterDataeHoraAtual();
    });
}

// ==========================================
// MÓDULO 1.2: O QUADRO DE POST-ITS (MODAL S.S)
// ==========================================
const btnAbrirModalSS = document.getElementById('btnAbrirModalSS');
const btnFecharModalSS = document.getElementById('btnFecharModalSS');
const modalSS = document.getElementById('modalSS');
const tabelaSS = document.getElementById('tabelaSS');
const txtNumSS = document.getElementById('txtNumSS');

// Abre a Tela de Pesquisa de S.S
if (btnAbrirModalSS && modalSS) {
    btnAbrirModalSS.addEventListener('click', function() {
        modalSS.classList.remove('hidden');
        tabelaSS.innerHTML = '<tr><td colspan="4" style="text-align:center;">Buscando S.S pendentes no Supabase... ⏳</td></tr>';
        
        // Simulação da busca das SS Pendentes no banco
        setTimeout(() => {
            const ssPendentesBanco = [
                { numero: "501", prefixo: "1020", defeito: "Motor perdendo força na subida." },
                { numero: "502", prefixo: "3045", defeito: "Vazamento de ar na porta traseira." },
                { numero: "503", prefixo: "2088", defeito: "Luz do ABS acesa no painel." }
            ];
            renderizarTabelaSS(ssPendentesBanco);
        }, 800);
    });
}

// Fecha o Modal no (X)
if (btnFecharModalSS) {
    btnFecharModalSS.addEventListener('click', () => modalSS.classList.add('hidden'));
}

// Constrói as linhas do Modal
function renderizarTabelaSS(lista) {
    tabelaSS.innerHTML = ""; 
    if(lista.length === 0) {
        tabelaSS.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma S.S pendente.</td></tr>';
        return;
    }
    lista.forEach(ss => {
        tabelaSS.innerHTML += `
            <tr>
                <td><b>${ss.numero}</b></td>
                <td><span class="badge badge-blue">${ss.prefixo}</span></td>
                <td>${ss.defeito}</td>
                <td>
                    <button type="button" class="btn-small" style="background-color: var(--accent);" 
                    onclick="selecionarSS('${ss.numero}', '${ss.prefixo}', '${ss.defeito}')">
                        Importar
                    </button>
                </td>
            </tr>
        `;
    });
}

// A Função de "Grampear" a S.S na nossa O.S
window.selecionarSS = function(numero, prefixo, defeito) {
    // 1. Preenche a O.S
    txtNumSS.value = numero;
    
    // 2. Preenche o Veículo e engatilha o Módulo 2 (Busca de Placa/Modelo)
    const campoPrefixo = document.getElementById('txtPrefixo');
    if (campoPrefixo) {
        campoPrefixo.value = prefixo;
        campoPrefixo.focus();
        campoPrefixo.blur(); 
    }
    
    // 3. Preenche o Defeito e engatilha a cópia pro Encaminhamento (Módulo 3 e 4)
    const campoDefeito = document.getElementById('txtDefeito');
    if (campoDefeito) {
        campoDefeito.value = defeito;
        campoDefeito.dispatchEvent(new Event('input')); 
    }
    
    // 4. Esconde a telinha
    modalSS.classList.add('hidden');
};
