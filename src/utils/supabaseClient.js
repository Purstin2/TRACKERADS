import { createClient } from '@supabase/supabase-js';

// Supabase credentials from environment variables only
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check for environment injected variables
const effectiveSupabaseUrl = typeof __supabase_url !== 'undefined' ? __supabase_url : supabaseUrl;
const effectiveSupabaseAnonKey = typeof __supabase_anon_key !== 'undefined' ? __supabase_anon_key : supabaseAnonKey;

// Mock Supabase Query Builder
const mockSupabaseQueryBuilder = {
    _dataToReturn: [], 
    _errorToReturn: null, 
    _tableName: '', 
    _isSingle: false, 
    _operationType: null, 
    _mockInsertedData: [], 
    _selectCalledAfterMutation: false,
    
    _execute: async function() { 
        console.warn(`[MOCK] Supabase: Executing mock ${this._operationType || 'query'} on table '${this._tableName}' (single: ${this._isSingle})`); 
        
        if (this._errorToReturn) {
            return { data: null, error: this._errorToReturn };
        }
        
        let d = this._dataToReturn; 
        
        if ((this._operationType === 'insert' || this._operationType === 'update') && 
            this._mockInsertedData.length > 0 && 
            this._selectCalledAfterMutation) {
            d = this._mockInsertedData;
        }
        
        const r = this._isSingle ? (d.length > 0 ? d[0] : null) : d; 
        
        // Reset state for next query
        this._dataToReturn = []; 
        this._errorToReturn = null; 
        this._isSingle = false; 
        this._operationType = null; 
        this._mockInsertedData = []; 
        this._selectCalledAfterMutation = false; 
        
        return { data: r, error: null }; 
    },
    
    select: function(s='*') { 
        console.warn(`[MOCK] Supabase: .select('${s}') on table '${this._tableName}'`); 
        
        if (['insert', 'update', 'delete'].includes(this._operationType)) {
            this._selectCalledAfterMutation = true;
        } else {
            this._operationType = 'select';
        }
        
        return this; 
    },
    
    insert: function(v) { 
        console.warn(`[MOCK] Supabase: .insert() on table '${this._tableName}' with values:`, v); 
        this._operationType = 'insert'; 
        this._mockInsertedData = Array.isArray(v) 
            ? v.map(i => ({
                ...i, 
                id: crypto.randomUUID(), 
                created_at: new Date().toISOString()
            })) 
            : [{
                ...v, 
                id: crypto.randomUUID(), 
                created_at: new Date().toISOString()
            }]; 
        return this; 
    },
    
    update: function(v) { 
        console.warn(`[MOCK] Supabase: .update() on table '${this._tableName}' with values:`, v); 
        this._operationType = 'update'; 
        this._mockInsertedData = [v]; 
        return this; 
    },
    
    delete: function() { 
        console.warn(`[MOCK] Supabase: .delete() on table '${this._tableName}'`); 
        this._operationType = 'delete'; 
        this._mockInsertedData = []; 
        return this; 
    },
    
    order: function(c, o) { 
        console.warn(`[MOCK] Supabase: .order('${c}', ${JSON.stringify(o)}) on table '${this._tableName}'`); 
        return this; 
    },
    
    eq: function(c, v) { 
        console.warn(`[MOCK] Supabase: .eq('${c}', '${v}') on table '${this._tableName}'`); 
        return this; 
    },
    
    limit: function(c) { 
        console.warn(`[MOCK] Supabase: .limit(${c}) on table '${this._tableName}'`); 
        return this; 
    },
    
    single: function() { 
        console.warn(`[MOCK] Supabase: .single() on table '${this._tableName}'`); 
        this._isSingle = true; 
        return this; 
    },
    
    then: function(onfulfilled, onrejected) { 
        return this._execute().then(onfulfilled, onrejected); 
    },
    
    catch: function(onrejected) { 
        return this._execute().catch(onrejected); 
    }
};

// Try to initialize the Supabase client
let supabaseClient;
let isSupabaseMockActive = false;

try {
    console.log("[Supabase Init Attempt] Verificando se 'createClient' está disponível via importação de módulo...");
    
    if (typeof createClient === 'function') {
        console.log("[Supabase Init Attempt] 'createClient' FOI importado com sucesso.");
        
        // Simplified check for credentials
        if (effectiveSupabaseUrl && effectiveSupabaseAnonKey) {
            // Valida formato básico da URL
            if (!effectiveSupabaseUrl.startsWith('http')) {
                throw new Error("URL do Supabase inválida. Deve começar com 'http://' ou 'https://'");
            }
            
            // Valida formato básico da key (deve ser um JWT)
            if (effectiveSupabaseAnonKey.length < 50) {
                throw new Error("Chave anon do Supabase parece inválida (muito curta)");
            }
            
            console.log("[Supabase Init Attempt] Tentando inicializar cliente Supabase REAL com URL:", 
                effectiveSupabaseUrl.substring(0,30) + "...");
            
            supabaseClient = createClient(effectiveSupabaseUrl, effectiveSupabaseAnonKey);
            
            if (supabaseClient) {
                console.log("%c>>> REAL SUPABASE CLIENT INICIALIZADO COM SUCESSO VIA IMPORT <<<", 
                    "color: limegreen; font-weight: bold;");
            } else {
                throw new Error("[Supabase Init Attempt] createClient foi chamado mas retornou um valor 'falsy'.");
            }
        } else {
            // Mensagens detalhadas sobre o que está faltando
            const missing = [];
            if (!effectiveSupabaseUrl) missing.push('VITE_SUPABASE_URL');
            if (!effectiveSupabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');
            
            console.error("%c!!! ERRO: CREDENCIAIS SUPABASE NÃO ENCONTRADAS !!!", 
                "color: red; font-weight: bold; font-size: 14px;");
            console.error("%cVariáveis faltando: " + missing.join(', '), 
                "color: orange; font-weight: bold;");
            console.error("%cSOLUÇÃO:", "color: yellow; font-weight: bold;");
            console.error("1. Crie um arquivo .env na raiz do projeto");
            console.error("2. Adicione as seguintes linhas:");
            console.error("   VITE_SUPABASE_URL=https://seu-projeto.supabase.co");
            console.error("   VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui");
            console.error("3. Reinicie o servidor (npm run dev)");
            console.error("%cO sistema está rodando em MODO EXEMPLO (dados não são salvos)", 
                "color: red; font-weight: bold;");
            
            // Mostra alerta visual no console
            console.error("\n" + "=".repeat(60));
            console.error("⚠️  MODO EXEMPLO ATIVADO - DADOS NÃO SERÃO SALVOS");
            console.error("=".repeat(60) + "\n");
            
            supabaseClient = null;
        }
    } else {
        console.error("!!! [Supabase Init Attempt] 'createClient' NÃO é uma função após a importação. " + 
            "A biblioteca @supabase/supabase-js pode não estar sendo resolvida corretamente pelo ambiente de build/execução.");
        supabaseClient = null;
    }
} catch (error) {
    console.error('!!! [Supabase Init Attempt] ERRO CRÍTICO AO IMPORTAR OU INICIALIZAR O CLIENTE SUPABASE REAL:', error);
    supabaseClient = null;
}

// Create mock client if real client initialization failed
if (!supabaseClient) {
    console.error("%c!!! [Supabase Fallback] CLIENTE SUPABASE REAL NÃO INICIALIZADO. ATIVANDO MOCK CLIENT. !!!", 
        "color: red; font-weight: bold; font-size: 14px;");
    console.warn("Verifique os logs anteriores para erros de importação ou inicialização. " +
        "Certifique-se de que a biblioteca @supabase/supabase-js está acessível e as credenciais estão corretas.");
    
    // Mostra alerta visual mais visível
    console.error("\n" + "=".repeat(70));
    console.error("%c🚨 ATENÇÃO: SISTEMA EM MODO EXEMPLO 🚨", "color: red; font-weight: bold; font-size: 16px;");
    console.error("%cOs dados NÃO serão salvos no banco de dados!", "color: orange; font-weight: bold;");
    console.error("%cConfigure o arquivo .env com suas credenciais do Supabase", "color: yellow; font-weight: bold;");
    console.error("=".repeat(70) + "\n");
    
    isSupabaseMockActive = true;
    
    supabaseClient = {
        from: (tableName) => { 
            const i = { ...mockSupabaseQueryBuilder }; 
            i._tableName = tableName; 
            i._dataToReturn = []; 
            i._errorToReturn = null; 
            i._isSingle = false; 
            i._operationType = null; 
            i._mockInsertedData = []; 
            return i; 
        },
        
        rpc: async () => { 
            console.warn("[MOCK] Supabase: rpc"); 
            return { data: null, error: { message: "Supabase (mock): rpc" } }; 
        },
        
        auth: { 
            onAuthStateChange: () => { 
                console.warn("[MOCK] Supabase: auth.onAuthStateChange"); 
                return { data: { subscription: { unsubscribe: () => {} } } }; 
            },
            
            getUser: async () => { 
                console.warn("[MOCK] Supabase: auth.getUser"); 
                return { data: { user: { id: 'mock-user-id-getuser' } }, error: null }; 
            }, 
            
            signInAnonymously: async () => { 
                console.warn("[MOCK] Supabase: auth.signInAnonymously"); 
                return { data: { user: {id: 'mock-user-id-anon'} }, error: null }; 
            } 
        }
    };
}

export { supabaseClient, isSupabaseMockActive };