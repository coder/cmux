/**
 * Login Page for Web Interface
 * 
 * Handles authentication before loading the main application.
 */

import { useState } from 'react';
import styled from '@emotion/styled';
import { wsClient } from './websocket-client';

const LoginContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #1e1e1e;
  font-family: var(--font-primary);
`;

const LoginBox = styled.div`
  background: #2d2d30;
  border: 1px solid #464647;
  border-radius: 8px;
  padding: 40px;
  width: 400px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
`;

const Title = styled.h1`
  margin: 0 0 24px 0;
  color: #cccccc;
  font-size: 24px;
  font-weight: 600;
  text-align: center;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Label = styled.label`
  color: #cccccc;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
`;

const Input = styled.input`
  background: #3c3c3c;
  border: 1px solid #464647;
  border-radius: 4px;
  color: #cccccc;
  padding: 10px 12px;
  font-size: 14px;
  font-family: var(--font-primary);
  
  &:focus {
    outline: none;
    border-color: #007acc;
  }
  
  &::placeholder {
    color: #858585;
  }
`;

const Button = styled.button`
  background: #007acc;
  border: none;
  border-radius: 4px;
  color: #ffffff;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  
  &:hover {
    background: #005a9e;
  }
  
  &:disabled {
    background: #464647;
    color: #858585;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  color: #f48771;
  font-size: 13px;
  text-align: center;
  padding: 8px;
  background: #5a1d1d;
  border-radius: 4px;
`;

const ToggleLink = styled.button`
  background: none;
  border: none;
  color: #007acc;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font-size: 13px;
  
  &:hover {
    color: #005a9e;
  }
`;

const Footer = styled.div`
  margin-top: 16px;
  text-align: center;
  color: #858585;
  font-size: 13px;
`;

interface LoginPageProps {
  onLogin: (api: any) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Store token
      localStorage.setItem('cmux_token', data.token);
      localStorage.setItem('cmux_userId', data.userId);

      // Connect WebSocket
      await wsClient.connect(data.token);

      // Create API and notify parent
      const api = wsClient.createAPI();
      onLogin(api);
    } catch (err) {
      console.error('Authentication error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginContainer>
      <LoginBox>
        <Title>cmux {mode === 'login' ? 'Login' : 'Register'}</Title>
        
        <Form onSubmit={handleSubmit}>
          <div>
            <Label>Username</Label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
            />
          </div>

          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <Button type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'}
          </Button>
        </Form>

        <Footer>
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <ToggleLink onClick={() => setMode('register')}>
                Register
              </ToggleLink>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <ToggleLink onClick={() => setMode('login')}>
                Login
              </ToggleLink>
            </>
          )}
        </Footer>
      </LoginBox>
    </LoginContainer>
  );
}
