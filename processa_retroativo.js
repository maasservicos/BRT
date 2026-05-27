import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

// Inicializando os clientes
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configuração do tamanho do lote
const TAMANHO_LOTE = 10;

async function processarOsPorLote() {
  console.log(`🔍 Buscando um lote de ${TAMANHO_LOTE} Ordens de Serviço fechadas e sem preenchimento...`);

  try {
   
   // 1. Buscar apenas as O.S. do dia 21/05/2026 para frente que estão sem preenchimento
    const { data: ordens, error: osError } = await supabase
    .from('Ordens_Servico')
    .select('numero_sequencial, defeito_relatado')
    .eq('status', 'FECHADA')
    .or('servico_realizado.is.null, servico_realizado.eq.""')
    .gte('data_fechamento', '2026-05-21T00:00:00.000Z') // <-- Filtra do dia 21/05/2026 para frente
    .order('numero_sequencial', { ascending: true })
    .limit(20); // Mantém o limite dentro da cota diária gratuita

    if (osError) {
      console.error("❌ Erro ao buscar dados no Supabase:", osError);
      return;
    }

    if (!ordens || ordens.length === 0) {
      console.log("✨ Todas as Ordens de Serviço antigas já foram preenchidas! Nada para processar.");
      return;
    }

    console.log(`📋 Lote encontrado! Iniciando o processamento de ${ordens.length} ordens...\n`);

    const systemInstruction = `
      Você é um assistente técnico especialista em manutenção de frotas do sistema de BRT.
      Sua função é gerar um texto técnico, altamente profissional, curto e formal para o campo "Serviço Realizado" de uma Ordem de Serviço (O.S.).
      
      Regras de Negócio e Comportamento Cruciais:
      1. Foque estritamente na AÇÃO DE MANUTENÇÃO (o que foi feito para resolver o problema) e não apenas no diagnóstico do defeito.
      2. Comece o texto SEMPRE com um verbo de ação no particípio voltado para a resolução (ex: "Realizado o conserto...", "Efetuado o reparo...", "Realizada a limpeza...", "Substituída a...", "Corrigida a falha...").
      3. Quando a lista de insumos estiver vazia ("Nenhum insumo ou peça utilizado"), deduza a ação lógica corretiva com base no "Problema Relatado". 
         - Exemplo se o problema for 'pneu furado': "Realizado o conserto do pneu..."
         - Exemplo se o problema for 'vazamento': "Efetuada a vedação..." ou "Corrigido o vazamento..."
      4. Cruze a "Descrição do Problema" com os "Insumos Utilizados" sempre que houver peças para detalhar o que foi trocado.
      5. Seja direto e limite-se a no máximo 2 frases. Nunca use introduções ou saudações.
    `;

    // 2. Processar as 10 ordens do lote atual
    for (const os of ordens) {
      const numOS = os.numero_sequencial;
      console.log(`⚙️ [LOTE] Processando O.S. Nº ${numOS}...`);

      // Buscar os insumos vinculados a esta O.S.
      const { data: insumosData } = await supabase
        .from('OS_Encaminhamentos')
        .select('insumo_descricao, insumo_quantidade')
        .eq('numero_os_direto', numOS);

      // Formatar variáveis para a IA
      const descricaoProblema = os.defeito_relatado ? os.defeito_relatado.trim() : 'Defeito não detalhado.';
      const listaInsumos = insumosData && insumosData.length > 0
        ? insumosData.map(i => `${i.insumo_quantidade}x ${i.insumo_descricao}`).join(', ')
        : 'Nenhum insumo ou peça utilizado.';

      const prompt = `
        Gere a descrição do serviço realizado cruzando estes dados do BRT:
        - Problema Relatado: "${descricaoProblema}"
        - Insumos Aplicados: [${listaInsumos}]
        
        Retorne única e exclusivamente a frase final do serviço, sem introduções ou saudações.
      `;

      try {
        // Usando o flash que é mais rápido para lotes pequenos
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.1,
          }
        });

        const textoGerado = response.text.trim();

        // Gravar no Supabase
        const { error: updateError } = await supabase
          .from('Ordens_Servico')
          .update({ servico_realizado: textoGerado })
          .eq('numero_sequencial', numOS);

        if (updateError) {
          console.error(`❌ Erro ao salvar O.S. Nº ${numOS}:`, updateError);
        } else {
          console.log(`✅ O.S. Nº ${numOS} atualizada: "${textoGerado}"`);
        }

        } catch (aiError) {
            // ALTERAÇÃO AQUI: Vamos ver o que o Google está gritando de verdade
            console.error(`⚠️ Erro real na O.S. Nº ${numOS}:`, aiError.message || aiError);
        }

      // Pausa rápida de 2.5 segundos entre as O.S. dentro do mesmo lote
      await new Promise(resolve => setTimeout(resolve, 2500));
    }

    console.log(`\n🎉 Lote de 10 O.S. finalizado com sucesso!`);
    console.log(`💡 Se quiser processar mais 10, basta rodar "node processa_retroativo.js" novamente no terminal.`);

  } catch (globalError) {
    console.error("Erro inesperado na rotina de lotes:", globalError);
  }
}

processarOsPorLote();