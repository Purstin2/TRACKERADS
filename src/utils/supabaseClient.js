import { createClient } from '@supabase/supabase-js';

// Supabase credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ojzcfzxyfijprglbvigm.supabase.co"; 
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0ZGZrZWxkbXRleG5jdm94cWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4Mjk2MTAsImV4cCI6MjA2NDQwNTYxMH0.DnHlTRqggGLsAcXfJVpuv5iuQbKKuALuHckPRi0fiCE"; 

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
        
        // Check if credentials are not generic placeholders
        if (effectiveSupabaseUrl && effectiveSupabaseUrl !== 'YOUR_SUPABASE_URL' && 
            effectiveSupabaseAnonKey && effectiveSupabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY') {
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
            console.warn("!!! [Supabase Init Attempt] CREDENCIAIS SUPABASE SÃO PLACEHOLDERS GENÉRICOS " + 
                "(YOUR_SUPABASE_URL/KEY) OU NÃO FORNECIDAS. O cliente real não será inicializado.");
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
    console.error("!!! [Supabase Fallback] CLIENTE SUPABASE REAL NÃO INICIALIZADO. ATIVANDO MOCK CLIENT. !!!");
    console.warn("Verifique os logs anteriores para erros de importação ou inicialização. " +
        "Certifique-se de que a biblioteca @supabase/supabase-js está acessível e as credenciais estão corretas.");
    
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