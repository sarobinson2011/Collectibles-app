// src/components/NetworkWarning.tsx

import { useWallet } from "../eth/wallet";

export function NetworkWarning() {
    const { wrongNetwork, currentNetworkName, expectedNetworkName, switchToCorrectNetwork, hasProvider } = useWallet();

    if (!hasProvider) {
        return (
            <div style={{
                backgroundColor: '#fee',
                border: '2px solid #f00',
                padding: '1rem',
                margin: '1rem',
                borderRadius: '8px',
                textAlign: 'center'
            }}>
                <h3>⚠️ No Wallet Detected</h3>
                <p>Please install MetaMask or another Web3 wallet to use this app.</p>
                <a
                    href="https://metamask.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#00f', textDecoration: 'underline' }}
                >
                    Download MetaMask
                </a>
            </div>
        );
    }

    if (!wrongNetwork) {
        return null;
    }

    return (
        <div style={{
            backgroundColor: '#fef3c7',
            border: '2px solid #fbbf24',
            padding: '1rem',
            margin: '1rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#92400e'  // Add this line - dark brown/orange text
        }}>
            <h3>⚠️ Wrong Network</h3>
            <p>
                You are connected to <strong>{currentNetworkName}</strong>,
                but this app is configured for <strong>{expectedNetworkName}</strong>.
            </p>
            <p>Please switch networks to continue.</p>
            <button
                onClick={switchToCorrectNetwork}
                style={{
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    marginTop: '0.5rem'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
            >
                Switch to {expectedNetworkName}
            </button>
        </div>
    );
}