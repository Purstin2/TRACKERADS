import React, { useState } from 'react';
import { Mail, Lock, UserPlus, LogIn, AlertCircle } from 'lucide-react';

interface AuthFormProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
}

const AuthForm: React.FC<AuthFormProps> = ({ onLogin, onRegister }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return false;
    }
    
    // Check for test domains that Supabase rejects
    const testDomains = ['test.com', 'example.com', 'localhost'];
    const domain = email.split('@')[1]?.toLowerCase();
    
    return !testDomains.includes(domain);
  };

  const validatePassword = (password: string) => {
    return password.length >= 6;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!validateEmail(email)) {
      setValidationError('Email inválido');
      return;
    }

    if (!validatePassword(password)) {
      setValidationError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (isLogin) {
      await onLogin(email, password);
    } else {
      await onRegister(email, password);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        {validationError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400">
            <AlertCircle size={16} />
            <span className="text-sm">{validationError}</span>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
            Email
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full pl-9 pr-3 py-2.5 bg-[#131929] border border-white/[0.08] text-white rounded-xl text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              placeholder="seu@email.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
            Senha
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              className="w-full pl-9 pr-3 py-2.5 bg-[#131929] border border-white/[0.08] text-white rounded-xl text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              placeholder="••••••••"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-600">Mínimo de 6 caracteres</p>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-2"
        >
          {isLogin ? <LogIn size={16} /> : <UserPlus size={16} />}
          <span>{isLogin ? 'Entrar' : 'Criar Conta'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsLogin(!isLogin);
            setValidationError('');
          }}
          className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors py-1"
        >
          {isLogin ? 'Não tem uma conta? Criar conta' : 'Já tem uma conta? Fazer login'}
        </button>
      </form>
    </div>
  );
};

export default AuthForm;