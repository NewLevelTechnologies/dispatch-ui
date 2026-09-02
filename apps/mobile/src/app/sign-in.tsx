import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '../auth/AuthContext';

export default function SignInScreen() {
  const { submit, respond, challenge, cancelChallenge } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Clear the previous answer whenever Cognito moves to a different step, so a
  // stale TOTP code is never resubmitted against a new challenge.
  useEffect(() => {
    setEntry('');
    setError(null);
  }, [challenge?.step]);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const failure = await fn();
    if (failure) setError(failure);
    setBusy(false);
  }

  // --- Challenge steps -------------------------------------------------------
  if (challenge) {
    const isChoice = challenge.kind === 'mfaSelection';
    const isPassword = challenge.kind === 'newPassword';
    const canSend = entry.trim().length > 0 && !busy;

    return (
      <>
        <Stack.Screen options={{ title: 'Verify' }} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>
              {isChoice ? 'Choose a method' : isPassword ? 'Set a new password' : 'Verification'}
            </Text>

            {challenge.kind === 'code' && (
              <>
                {challenge.hint ? <Text style={styles.subtitle}>{challenge.hint}</Text> : null}
                <Text style={styles.label}>{challenge.prompt}</Text>
                <TextInput
                  style={[styles.input, styles.code]}
                  value={entry}
                  onChangeText={setEntry}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  autoFocus
                  editable={!busy}
                  maxLength={10}
                  placeholder="123456"
                  onSubmitEditing={() => canSend && run(() => respond(entry.trim()))}
                />
              </>
            )}

            {challenge.kind === 'totpSetup' && (
              <>
                <Text style={styles.subtitle}>
                  Add this secret to your authenticator app, then enter the code it shows.
                </Text>
                <View style={styles.secretBox}>
                  <Text selectable style={styles.secret}>
                    {challenge.secret}
                  </Text>
                </View>
                <Text style={styles.label}>Authenticator code</Text>
                <TextInput
                  style={[styles.input, styles.code]}
                  value={entry}
                  onChangeText={setEntry}
                  keyboardType="number-pad"
                  autoFocus
                  editable={!busy}
                  maxLength={10}
                  placeholder="123456"
                />
              </>
            )}

            {isChoice && (
              <>
                <Text style={styles.subtitle}>This account has more than one method enabled.</Text>
                {challenge.options.map((option) => (
                  <Pressable
                    key={option}
                    style={styles.option}
                    disabled={busy}
                    onPress={() => run(() => respond(option))}
                  >
                    <Text style={styles.optionText}>{option}</Text>
                  </Pressable>
                ))}
              </>
            )}

            {isPassword && (
              <>
                <Text style={styles.subtitle}>
                  This account requires a new password before signing in.
                </Text>
                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  value={entry}
                  onChangeText={setEntry}
                  secureTextEntry
                  autoCapitalize="none"
                  autoFocus
                  editable={!busy}
                />
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {!isChoice && (
              <Pressable
                style={[styles.button, !canSend && styles.buttonDisabled]}
                disabled={!canSend}
                onPress={() => run(() => respond(entry.trim()))}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Verify</Text>
                )}
              </Pressable>
            )}

            <Pressable style={styles.link} disabled={busy} onPress={cancelChallenge}>
              <Text style={styles.linkText}>Start over</Text>
            </Pressable>

            <Text style={styles.step}>{challenge.step}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </>
    );
  }

  // --- Password step ---------------------------------------------------------
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  return (
    <>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Dispatch</Text>
          <Text style={styles.subtitle}>Sign in with your Dispatch account.</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            editable={!busy}
            placeholder="you@example.com"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            editable={!busy}
            onSubmitEditing={() => canSubmit && run(() => submit(email.trim(), password))}
            returnKeyType="go"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            disabled={!canSubmit}
            onPress={() => run(() => submit(email.trim(), password))}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
          </Pressable>

          <Text style={styles.hint}>
            Same credentials as the web app — mobile points at the same Cognito user pool.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, paddingTop: 48 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#6b7280', marginBottom: 24 },
  label: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  code: { fontSize: 22, letterSpacing: 4, textAlign: 'center' },
  secretBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
  },
  secret: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 },
  option: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  optionText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  error: { color: '#dc2626', marginBottom: 12 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { backgroundColor: '#9ca3af' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#2563eb', fontSize: 15 },
  hint: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 24 },
  step: { fontSize: 11, color: '#d1d5db', textAlign: 'center', marginTop: 24 },
});
