// Quick Sentry Test Component
// Add this to any screen temporarily to test Sentry

import { Button } from 'react-native';
import { captureMessage, captureException } from '@/lib/sentry';

export function SentryTestButton() {
    const testSentry = () => {
        // Test 1: Send a message
        captureMessage('Sentry test message from AIAdvocate!', 'info');

        // Test 2: Send an error
        try {
            throw new Error('Test error from AIAdvocate - Sentry is working!');
        } catch (error) {
            captureException(error as Error, {
                context: {
                    test: true,
                    timestamp: new Date().toISOString(),
                }
            });
        }

        alert('Test events sent to Sentry! Check your dashboard.');
    };

    return <Button title="Test Sentry" onPress={testSentry} />;
}
