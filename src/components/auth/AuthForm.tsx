import React, { useState } from 'react';
import { HACKER_COLORS } from '../../styles/theme';
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
    return emailRegex.test(email);
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
    <div className={`w-full max-w-md mx-auto p-6 ${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderNeon} rounded-lg shadow-lg`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {validationError && (
          <div className={`p-3 rounded-md bg-red-900/30 border border-red-500 flex items-center space-x-2 text-red-400`}>
            <AlertCircle size={18} />
            <span className="text-sm">{validationError}</span>
          </div>
        )}

        <div>
          <label htmlFor="email" className={`block text-sm font-medium ${HACKER_COLORS.textDim} mb-1`}>
            EMAIL
          </label>
          <div className="relative">
            <Mail size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${HACKER_COLORS.textDim}`} />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`w-full pl-10 pr-3 py-2 ${HACKER_COLORS.surface} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} rounded-md focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none`}
              placeholder="seu@email.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className={`block text-sm font-medium ${HACKER_COLORS.textDim} mb-1`}>
            SENHA
          </label>
          <div className="relative">
            <Lock size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${HACKER_COLORS.textDim}`} />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`w-full pl-10 pr-3 py-2 ${HACKER_COLORS.surface} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} rounded-md focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none`}
              placeholder="••••••••"
            />
          </div>
          <p className={`mt-1 text-xs ${HACKER_COLORS.textDim}`}>
            Mínimo de 6 caracteres
          </p>
        </div>

        <button
          type="submit"
          className={`w-full ${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} px-4 py-2 rounded-md hover:${HACKER_COLORS.buttonPrimaryBg} transition-colors flex items-center justify-center space-x-2 text-sm font-medium border border-black/50`}
        >
          {isLogin ? <LogIn size={18} /> : <UserPlus size={18} />}
          <span>{isLogin ? 'ENTRAR' : 'CRIAR CONTA'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsLogin(!isLogin);
            setValidationError('');
          }}
          className={`w-full text-sm ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primaryNeon}`}
        >
          {isLogin ? 'Não tem uma conta? Criar conta' : 'Já tem uma conta? Fazer login'}
        </button>
      </form>
    </div>
  );
};

export default AuthForm;