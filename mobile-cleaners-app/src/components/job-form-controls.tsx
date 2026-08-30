import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export function UnverifiedBanner() {
  return (
    <View style={styles.unverifiedBanner}>
      <ThemedText type="smallBold" style={{ color: '#8A6D00' }}>
        Not verified
      </ThemedText>
      <ThemedText type="small" style={{ color: '#8A6D00' }}>
        Tap the NFC tag to unlock completion - opening this from the task list only lets you preview the job.
      </ThemedText>
    </View>
  );
}

export function SubmitButton({
  submitting,
  verified,
  disabled,
  onPress,
}: {
  submitting: boolean;
  verified: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={submitting || disabled || !verified}
      style={[styles.submitButton, { backgroundColor: '#208AEF', opacity: submitting || !verified ? 0.5 : 1 }]}
    >
      {submitting ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <ThemedText style={styles.submitText}>{verified ? 'Submit' : 'Scan tag to submit'}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  unverifiedBanner: {
    backgroundColor: '#FFF3C4',
    borderRadius: 10,
    padding: 12,
    gap: 2,
  },
  submitButton: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
