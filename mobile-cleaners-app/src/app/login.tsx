import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) setError(signInError.message);
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={40}
      >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ThemedText type="title" style={styles.title}>
          Fiz Fix Cleaner
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Sign in with the account the office set up for you.
        </ThemedText>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <View style={{ position: 'relative', justifyContent: 'center' }}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry={!showPassword}
            autoComplete="password"
            style={[styles.input, styles.passwordInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            style={styles.passwordToggle}
            hitSlop={8}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <ThemedText style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</ThemedText>
          </Pressable>
        </View>

        {error && (
          <ThemedText themeColor="text" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <Pressable
          onPress={signIn}
          disabled={loading}
          style={[styles.button, { backgroundColor: '#208AEF', opacity: loading ? 0.7 : 1 }]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>Sign in</ThemedText>}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 32, marginBottom: 4 },
  subtitle: { marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  passwordInput: {
    paddingRight: 44,
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    height: '100%',
    justifyContent: 'center',
  },
  error: { color: '#D64545' },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
