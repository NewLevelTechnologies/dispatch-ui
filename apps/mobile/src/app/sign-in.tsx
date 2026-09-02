import { useState } from 'react';
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
import { useTranslation } from '@dispatch/i18n';
import { useAuth } from '../auth/AuthContext';
import type { Challenge } from '../auth/AuthContext';

export default function SignInScreen() {
  const { challenge } = useAuth();

  // Keyed on the step so React remounts the form whenever Cognito advances.
  // That resets the entered code and any error for free — the alternative, an
  // effect syncing state to the step, is what react-hooks/set-state-in-effect
  // warns about, and it leaves a frame where a stale code is still on screen.
  return challenge ? (
    <ChallengeForm key={challenge.step} challenge={challenge} />
  ) : (
    <PasswordForm />
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const { submit } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const failure = await submit(email.trim(), password);
    if (failure) setError(failure);
    setBusy(false);
  }

  return (
    <>
      <Stack.Screen options={{ title: t('auth.signIn') }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>{t('app.name')}</Text>
          <Text style={styles.subtitle}>{t('auth.signInPrompt')}</Text>

          <Text style={styles.label}>{t('auth.emailLabel')}</Text>
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
            placeholder={t('auth.emailPlaceholder')}
          />

          <Text style={styles.label}>{t('auth.passwordLabel')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            editable={!busy}
            onSubmitEditing={() => canSubmit && onSubmit()}
            returnKeyType="go"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            disabled={!canSubmit}
            onPress={onSubmit}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('auth.signIn')}</Text>}
          </Pressable>

          <Text style={styles.hint}>{t('auth.sameCredentialsAsWeb')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function ChallengeForm({ challenge }: { challenge: Challenge }) {
  const { t } = useTranslation();
  const { respond, cancelChallenge } = useAuth();
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isChoice = challenge.kind === 'mfaSelection';
  const isPassword = challenge.kind === 'newPassword';
  const canSend = entry.trim().length > 0 && !busy;

  async function send(value: string) {
    setBusy(true);
    setError(null);
    const failure = await respond(value);
    if (failure) setError(failure);
    setBusy(false);
  }

  const heading = isChoice
    ? t('auth.chooseMethod')
    : isPassword
      ? t('auth.setNewPassword')
      : t('auth.verificationTitle');

  return (
    <>
      <Stack.Screen options={{ title: t('auth.verify') }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>{heading}</Text>

          {challenge.kind === 'code' && (
            <>
              {challenge.hintKey ? (
                <Text style={styles.subtitle}>{t(challenge.hintKey, challenge.hintValues)}</Text>
              ) : null}
              <Text style={styles.label}>{t(challenge.promptKey)}</Text>
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
                placeholder={t('auth.codePlaceholder')}
                onSubmitEditing={() => canSend && send(entry.trim())}
              />
            </>
          )}

          {challenge.kind === 'totpSetup' && (
            <>
              <Text style={styles.subtitle}>{t('auth.totpSetupHint')}</Text>
              <View style={styles.secretBox}>
                <Text selectable style={styles.secret}>
                  {challenge.secret}
                </Text>
              </View>
              <Text style={styles.label}>{t('auth.authenticatorCode')}</Text>
              <TextInput
                style={[styles.input, styles.code]}
                value={entry}
                onChangeText={setEntry}
                keyboardType="number-pad"
                autoFocus
                editable={!busy}
                maxLength={10}
                placeholder={t('auth.codePlaceholder')}
              />
            </>
          )}

          {challenge.kind === 'mfaSelection' && (
            <>
              <Text style={styles.subtitle}>{t('auth.mfaMultipleEnabled')}</Text>
              {challenge.options.map((option) => (
                <Pressable key={option} style={styles.option} disabled={busy} onPress={() => send(option)}>
                  <Text style={styles.optionText}>{option}</Text>
                </Pressable>
              ))}
            </>
          )}

          {challenge.kind === 'newPassword' && (
            <>
              <Text style={styles.subtitle}>{t('auth.newPasswordRequired')}</Text>
              <Text style={styles.label}>{t('auth.newPassword')}</Text>
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
              onPress={() => send(entry.trim())}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('auth.verify')}</Text>}
            </Pressable>
          )}

          <Pressable style={styles.link} disabled={busy} onPress={cancelChallenge}>
            <Text style={styles.linkText}>{t('auth.startOver')}</Text>
          </Pressable>

          {/* Raw Cognito step, deliberately shown: if an unexpected challenge
              arrives, this is the first thing anyone debugging it needs. */}
          <Text style={styles.step}>{challenge.step}</Text>
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
  secretBox: { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 14, marginBottom: 20 },
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
