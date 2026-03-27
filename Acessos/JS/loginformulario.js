import { client } from './supabaseClient.js';

document.getElementById('btnEntrar')?.addEventListener('click', async function(e) {
    e.preventDefault(); // Evita que a página recarregue se estiver num <form>

    const emailDigitado = document.getElementById('txtEmail').value.trim();
    const senhaDigitada = document.getElementById('txtSenha').value;

    if (!emailDigitado || !senhaDigitada) {
        return alert("Por favor, preencha o e-mail (ou usuário) e a senha.");
    }

    try {
        // 1. Vai na SUA tabela 'Usuarios' e procura alguém com esse email e senha
        const { data: usuario, error } = await client
            .from('Usuarios')
            .select('*')
            .eq('email', emailDigitado) // Se preferir logar pelo campo 'usuario', troque aqui
            .eq('senha', senhaDigitada)
            .maybeSingle(); // maybeSingle não quebra o código se não achar ninguém

        if (error) throw error;

        // 2. Se não encontrou, barra na porta
        if (!usuario) {
            return alert("E-mail ou senha incorretos. Tente novamente.");
        }

        // 3. Login com sucesso! Grava o "crachá" no navegador do cara
        // Não salvamos a senha no navegador por segurança, só o perfil
        const cracha = {
            nome: usuario.nome,
            grupo: usuario.grupo,
            subgrupo: usuario.subgrupo
        };
        localStorage.setItem('maas_usuario_logado', JSON.stringify(cracha));

        // 4. O Roteador Inteligente (Manda cada um pro seu quadrado)
        if (usuario.grupo === 'BRT') {
            window.location.href = "Ocorrência BRT\HTML\form.html"; // Coloque o caminho correto da sua pasta
        } 
        else if (usuario.grupo === 'Maas') {
            if (usuario.subgrupo === 'Manutencao') {
                window.location.href = "index.html"; 
            } 
            else if (usuario.subgrupo === 'Operacao') {
                window.location.href = "Controle de S.S/controledeSS.html"; 
            } 
            else {
                alert(`Subgrupo '${usuario.subgrupo}' não possui uma tela inicial definida.`);
            }
        } 
        else {
            alert(`Grupo '${usuario.grupo}' não reconhecido pelo sistema.`);
        }

    } catch (err) {
        alert("Erro técnico ao tentar logar: " + err.message);
    }
});