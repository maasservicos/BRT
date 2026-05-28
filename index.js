import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

// 1. Inicializando o servidor Express
const app = express();
app.use(cors());
app.use(express.json()); 


// 2. Inicializando os Clientes do Supabase e da IA do Gemini
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * ROTA: GET /api/os/:id/sugerir-servico
 */
app.get('/api/os/:id/sugerir-servico', async (req, res) => {
  const osId = req.params.id; // Esse é o ID ou Número Sequencial que vai vir na URL

  try {
    // 3. Buscar o defeito relatado na tabela Ordens_Servico
    const numOS = parseInt(osId, 10);

    const { data: osData, error: osError } = await supabase
      .from('Ordens_Servico') 
      .select('*') // Vamos puxar todos os campos temporariamente para testar
      .eq('numero_sequencial', numOS) // Se o nome da coluna no banco for 'id', mude aqui para 'id'
      .maybeSingle(); // 🚀 Alterado para maybeSingle para evitar quebras se o registro não for único

    // Se o Supabase der QUALQUER erro, ele vai jogar na tela do seu navegador agora
    if (osError) {
      return res.status(400).json({ 
        error: 'Erro retornado pelo Supabase', 
        detalhes: osError 
      });
    }

    if (!osData) {
      return res.status(404).json({ error: 'O banco respondeu com sucesso, mas essa O.S. não existe.' });
    }

    // 4. Buscar os Insumos/Peças na tabela OS_Encaminhamentos
    const { data: insumosData, error: insumosError } = await supabase
      .from('OS_Encaminhamentos')
      .select('insumo_descricao, insumo_quantidade')
      .eq('numero_os_direto', numOS);

    if (insumosError) {
      console.error('Aviso ao buscar insumos (continuando o fluxo):', insumosError);
    }

    // 5. Formatar as variáveis para a IA
    const descricaoProblema = osData.defeito_relatado || 'Descrição do problema não fornecida.';
    const listaInsumos = insumosData && insumosData.length > 0
      ? insumosData.map(i => `${i.insumo_quantidade}x ${i.insumo_descricao}`).join(', ')
      : 'Nenhum insumo ou peça utilizado.';

    // 6. Configurar o Prompt e as Regras do System Instruction
    const systemInstruction = `
      Você é um assistente técnico especialista em manutenção de frotas do sistema de Onibus Eletricos e BRT.
      Sua função é gerar um texto técnico, altamente profissional, curto e formal para o campo "Serviço Realizado" de uma Ordem de Serviço (O.S.).
      
      Regras de Negócio e Comportamento:
      1. Cruze estritamente a "Descrição do Problema" com os "Insumos Utilizados".
      2. Comece o texto sempre com um verbo de ação no particípio (ex: "Realizada a substituição...", "Efetuado o reparo...", "Corrigida a falha...").
      3. Seja direto e limite-se a no máximo 2 frases.
      4. Nunca invente peças, componentes ou problemas que não foram fornecidos nas entradas.
    `;

    const prompt = `
      Gere a descrição do serviço realizado cruzando estes dados do BRT:
      - Problema Relatado: "${descricaoProblema}"
      - Insumos Aplicados: [${listaInsumos}]
      
      Retorne única e exclusivamente a frase final do serviço, sem introduções ou saudações.
    `;

    // 7. Chamar a API do Gemini (Sintaxe Corrigida para o SDK Novo '@google/genai')
   // 7. Chamar a API do Gemini (Com proteção contra quedas e oscilações 503)
    console.log("🤖 Enviando requisição ao modelo gemini-2.5-flash...");
    
    let servicoSugerido = "";

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.1, 
        }
      });
      servicoSugerido = response.text.trim();
      console.log("✅ Resposta da IA gerada com sucesso!");
    } catch (geminiError) {
      console.error("💥 Instabilidade na API do Gemini (503/Cota):", geminiError.message);
      // Fallback: Se o Google falhar, gera o texto técnico padrão para não travar a oficina
      servicoSugerido = `Realizada manutenção e conserto do defeito informado pelo Cliente:  ${descricaoProblema}.`;
    }

    // 8. Retornar a sugestão gerada para o Frontend
    return res.json({
      os_id: numOS,
      sugestao: servicoSugerido
    });

  } catch (error) {
    console.error('Erro interno no servidor do sistema:', error);
    return res.status(500).json({ error: 'Erro ao processar a sugestão da IA.' });
  }
});

/**
 * ROTA: PUT /api/os/:id/gravar-servico
 * OBJETIVO: Gravar o texto definitivo do "Serviço Realizado" e atualizar o status da O.S.
 */
app.put('/api/os/:id/gravar-servico', async (req, res) => {
  const osId = req.params.id;
  const { servico_realizado } = req.body; // Pega o texto enviado pelo frontend

  // Validação básica para não salvar um campo vazio
  if (!servico_realizado || servico_realizado.trim() === "") {
    return res.status(400).json({ error: 'O texto do serviço realizado não pode estar vazio.' });
  }

  try {
    const numOS = parseInt(osId, 10);

    // Atualiza a tabela Ordens_Servico no Supabase
    const { data, error } = await supabase
      .from('Ordens_Servico')
      .update({ 
        servico_realizado: servico_realizado.trim(),
      })
      .eq('numero_sequencial', numOS)
      .select(); // O select() faz o Supabase retornar a linha updated

    if (error) {
      console.error('Erro ao gravar no Supabase:', error);
      return res.status(500).json({ error: 'Erro ao salvar o serviço realizado no banco.', detalhes: error });
    }

    // Retorna sucesso para o frontend
    return res.json({
      success: true,
      message: 'Serviço realizado gravado com sucesso!',
      dados: data
    });

  } catch (error) {
    console.error('Erro interno na rota de gravação:', error);
    return res.status(500).json({ error: 'Erro interno ao processar a gravação.' });
  }
});

// 10. Iniciar o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor do BRT rodando com sucesso na porta ${PORT}`);
});