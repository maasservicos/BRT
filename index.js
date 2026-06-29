import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import { BigQuery } from '@google-cloud/bigquery';
import 'dotenv/config';

const formatarDataHora = (valor) => {
  if (!valor) return null;
  const raw = valor?.value ?? valor;
  if (!raw) return null;
  return new Date(raw).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

// 1. Inicializando o servidor Express
const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));


// 2. Inicializando os Clientes do Supabase, Gemini e BigQuery
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const bigquery = new BigQuery({
  projectId: 'gcp-maas-proj-manutencao',
  credentials: JSON.parse(process.env.BIGQUERY_CREDENTIALS || '{}'),
  location: 'us-east1',
});

/**
 * ROTA: POST /api/extrair-documento
 * PDF  → extrai texto com pdf-parse + regex (gratuito, sem limite)
 * Imagem → Gemini Vision
 */
app.post('/api/extrair-documento', async (req, res) => {
  const { base64, mimeType } = req.body;

  if (!base64 || !mimeType) {
    return res.status(400).json({ error: 'Campos base64 e mimeType são obrigatórios.' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');

    if (mimeType === 'application/pdf') {
      // --- PDF: extração local com regex, sem consumir API ---
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      const texto = pdfData.text;

      // Prefixo: "CARRO: 1:1231" → "1231"
      const matchCarro = texto.match(/CARRO:\s*\d+:(\d+)/i);
      const prefixo = matchCarro ? matchCarro[1].trim() : '';

      // KM: "KM:14.941" → "14941" (ponto é separador de milhar no BR)
      const matchKm = texto.match(/KM:\s*([\d.]+)/i);
      const km = matchKm ? matchKm[1].replace(/\./g, '') : '';

      // Defeito: linhas numeradas dentro da seção "Sintomas relatados pelo Motorista"
      const linhas = texto.split(/\r?\n/);
      const sintomas = [];
      let dentroDaSessao = false;
      for (const linha of linhas) {
        const l = linha.trim();
        if (!dentroDaSessao && /Sintomas relatados/i.test(l)) {
          dentroDaSessao = true;
          continue;
        }
        if (dentroDaSessao) {
          if (/^Motorista|^Mec[âa]nico|^Discrimina/i.test(l)) break;
          // Formato: "Descrição do defeito    1"  (texto primeiro, número no fim)
          const m = l.match(/^(.+?)\s+\d+\s*$/);
          if (m && m[1].trim().length > 2 && !/NÃO|SIM|CÓD/i.test(m[1])) {
            sintomas.push(m[1].trim());
          }
        }
      }
      const defeito = sintomas.join('; ');

      return res.json({ prefixo, km, defeito });

    } else {
      // --- Imagem: Gemini Vision ---
      const prompt = `Analise esta imagem de "Solicitação de Serviço" da Metrobus e extraia:
1. "prefixo": campo CARRO, apenas os dígitos após os dois pontos (ex: "1:1231" → "1231").
2. "km": campo KM, apenas dígitos sem pontos (ex: "14.941" → "14941").
3. "defeito": sintomas relatados pelo motorista, texto completo.
Retorne APENAS JSON válido sem markdown. Exemplo: {"prefixo":"1231","km":"14941","defeito":"completar o oleo idraulico da direcao"}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: prompt }
          ]
        }],
        config: { temperature: 0 }
      });

      const textoResposta = response.text.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
      const dados = JSON.parse(textoResposta);

      return res.json({
        prefixo: dados.prefixo || '',
        km: dados.km || '',
        defeito: dados.defeito || ''
      });
    }

  } catch (erro) {
    console.error('Erro ao extrair documento:', erro);
    return res.status(500).json({ error: 'Erro ao processar o documento.' });
  }
});

/**
 * ROTA: POST /api/sugerir-etapa
 * Recebe defeito + lista de etapas BR e retorna a mais adequada via Gemini.
 */
app.post('/api/sugerir-etapa', async (req, res) => {
  const { defeito, etapas } = req.body;

  if (!defeito || !etapas || etapas.length === 0) {
    return res.status(400).json({ error: 'defeito e etapas são obrigatórios.' });
  }

  const listaEtapas = etapas.map(e => `${e.codigo_etapa}: ${e.descricao}`).join('\n');

  const prompt = `Você é um especialista em manutenção de ônibus BRT. Analise o defeito relatado e escolha a etapa de manutenção mais adequada da lista abaixo.

Defeito relatado: "${defeito}"

Etapas disponíveis:
${listaEtapas}

Retorne APENAS um JSON válido sem markdown, sem texto adicional. Exemplo: {"codigo":"BR0001","descricao":"Descrição da etapa"}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0 }
    });

    const texto = response.text.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
    const resultado = JSON.parse(texto);

    return res.json({ codigo: resultado.codigo || '', descricao: resultado.descricao || '' });
  } catch (erro) {
    console.error('Erro ao sugerir etapa:', erro);
    return res.status(500).json({ error: 'Erro ao processar sugestão de etapa.' });
  }
});

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

/**
 * ROTA: GET /api/bigquery/diagnostico
 * Retorna a localização real do dataset SILVER_SIAN.
 */
app.get('/api/bigquery/diagnostico', async (req, res) => {
  try {
    const [metadata] = await bigquery.dataset('silver').getMetadata();
    const [tables] = await bigquery.dataset('silver').getTables();
    return res.json({
      location: metadata.location,
      tabelas: tables.map(t => t.id),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, code: err.code });
  }
});

/**
 * ROTA: GET /api/bigquery/os/:prefixo
 * Busca no BigQuery a O.S mais recente de um veículo pelo prefixo.
 */
app.get('/api/bigquery/os/:prefixo', async (req, res) => {
  const prefixo = parseInt(req.params.prefixo, 10);
  if (isNaN(prefixo)) return res.status(400).json({ error: 'Prefixo inválido.' });

  const query = `
    SELECT
      os.ID_SEQUENCIAL,
      os.STATUS,
      os.DATA_FIM,
      os.CREATED_AT,
      os.UPDATED_AT,
      os.DESCRICAO_SERVICO
    FROM \`gcp-maas-proj-manutencao.silver.SILVER_SIAN_SUPABASE_VEICULO\`       v
    JOIN \`gcp-maas-proj-manutencao.silver.SILVER_SIAN_SUPABASE_SOLICITACOES\` s ON s.VEICULO_ID = v.UUID
    JOIN \`gcp-maas-proj-manutencao.silver.SILVER_SIAN_SUPABASE_OS\`           os ON os.SOLICITACAO_ID = s.UUID
    WHERE v.PREFIXO = @prefixo
    ORDER BY os.CREATED_AT DESC
    LIMIT 1
  `;

  try {
    const [rows] = await bigquery.query({
      query,
      params: { prefixo },
      types: { prefixo: 'INT64' },
      location: 'us-east1',
    });

    if (!rows.length) {
      return res.status(404).json({ error: `Nenhum registro encontrado no BigQuery para o prefixo ${prefixo}.` });
    }

    const r = rows[0];
    return res.json({
      numero_os:        r.ID_SEQUENCIAL ?? null,
      status:           r.STATUS ?? '',
      data_abertura:    formatarDataHora(r.CREATED_AT),
      data_fechamento:  formatarDataHora(r.DATA_FIM ?? r.UPDATED_AT),
      criado_em:        formatarDataHora(r.CREATED_AT),
      atualizado_em:    formatarDataHora(r.UPDATED_AT),
      descricao_servico: r.DESCRICAO_SERVICO ?? '',
    });
  } catch (err) {
    console.error('Erro BigQuery (individual):', err);
    return res.status(500).json({
      error: err.message || 'Sem mensagem',
      code: err.code,
      status: err.status,
      errors: err.errors,
    });
  }
});

/**
 * ROTA: POST /api/bigquery/sincronizar-lote
 * Recebe [{id_supabase, prefixo}], faz uma única query BigQuery com UNNEST,
 * e atualiza data_abertura, data_fechamento e defeito_relatado no Supabase.
 */
app.post('/api/bigquery/sincronizar-lote', async (req, res) => {
  const { registros } = req.body;
  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ error: 'Forneça um array de registros.' });
  }

  const prefixos = registros
    .map(r => parseInt(r.prefixo, 10))
    .filter(p => !isNaN(p));

  if (prefixos.length === 0) {
    return res.status(400).json({ error: 'Nenhum prefixo válido informado.' });
  }

  const query = `
    SELECT
      v.PREFIXO,
      os.CREATED_AT,
      os.UPDATED_AT,
      os.DESCRICAO_SERVICO
    FROM \`gcp-maas-proj-manutencao.silver.SILVER_SIAN_SUPABASE_VEICULO\`       v
    JOIN \`gcp-maas-proj-manutencao.silver.SILVER_SIAN_SUPABASE_SOLICITACOES\` s ON s.VEICULO_ID = v.UUID
    JOIN \`gcp-maas-proj-manutencao.silver.SILVER_SIAN_SUPABASE_OS\`           os ON os.SOLICITACAO_ID = s.UUID
    WHERE v.PREFIXO IN UNNEST(@prefixos)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY v.PREFIXO ORDER BY os.CREATED_AT DESC) = 1
  `;

  try {
    const [rows] = await bigquery.query({
      query,
      params: { prefixos },
      types: { prefixos: ['INT64'] },
      location: 'us-east1',
    });

    // Indexa resultados do BigQuery por prefixo para lookup O(1)
    const bqMap = {};
    for (const r of rows) {
      bqMap[String(r.PREFIXO)] = {
        data_abertura:    r.CREATED_AT?.value ?? r.CREATED_AT ?? null,
        data_fechamento:  r.UPDATED_AT?.value  ?? r.UPDATED_AT  ?? null,
        descricao_servico: r.DESCRICAO_SERVICO ?? '',
      };
    }

    const resultados = [];
    for (const reg of registros) {
      const prefixo = parseInt(reg.prefixo, 10);
      const bq = bqMap[String(prefixo)];

      if (!bq) {
        resultados.push({ id: reg.id_supabase, prefixo, sucesso: false, erro: 'Não encontrado no BigQuery' });
        continue;
      }

      const { error } = await supabase
        .from('Ordens_Servico')
        .update({
          data_abertura:    bq.data_abertura,
          data_fechamento:  bq.data_fechamento,
          defeito_relatado: bq.descricao_servico,
        })
        .eq('id', reg.id_supabase);

      if (error) {
        resultados.push({ id: reg.id_supabase, prefixo, sucesso: false, erro: error.message });
      } else {
        resultados.push({ id: reg.id_supabase, prefixo, sucesso: true, ...bq });
      }
    }

    return res.json({ resultados });
  } catch (err) {
    console.error('Erro BigQuery (lote):', err);
    return res.status(500).json({ error: 'Erro ao consultar o BigQuery.' });
  }
});

// 10. Iniciar o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor do BRT rodando com sucesso na porta ${PORT}`);
});