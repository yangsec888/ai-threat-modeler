/**
 * Login Component for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

'use client'

import { useState } from 'react';
import Image from 'next/image';
import logo from '@/app/logo.png';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { validateUsername, validateEmail, sanitizeErrorMessage, truncateString } from '@/lib/security';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate input
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      // Try email validation if username validation fails
      const emailValidation = validateEmail(username);
      if (!emailValidation.valid) {
        setError(usernameValidation.error || emailValidation.error || 'Invalid username or email');
        setLoading(false);
        return;
      }
    }

    // Truncate inputs to prevent DoS
    const sanitizedUsername = truncateString(username.trim(), 254);
    const sanitizedPassword = truncateString(password, 128);

    try {
      await login(sanitizedUsername, sanitizedPassword);
    } catch (err: unknown) {
      setError(sanitizeErrorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-4">
          <Image
            src={logo}
            alt="AI Threat Modeler"
            width={160}
            height={160}
            className="object-contain"
            priority
          />
          <h1 className="text-2xl font-bold text-center">AI Threat Modeler</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>Enter your credentials to access the application</CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username or Email
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username or email"
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}

