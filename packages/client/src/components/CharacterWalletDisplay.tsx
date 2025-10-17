/**
 * CharacterWalletDisplay.tsx - Wallet Info Display Component
 *
 * UI component for displaying character/agent wallet information.
 * Shows wallet address, balance, chain type, and provides quick actions.
 */

import React from "react";

/**
 * Character wallet data structure
 */
export interface CharacterWallet {
  address: string;
  chainType: string;
  hdIndex?: number;
  balance?: string;
  nftCount?: number;
}

/**
 * Character with wallet info
 */
export interface CharacterWithWallet {
  id: string;
  name: string;
  wallet?: CharacterWallet;
  hasWallet: boolean;
}

/**
 * Props for CharacterWalletDisplay
 */
export interface CharacterWalletDisplayProps {
  character: CharacterWithWallet;
  showBalance?: boolean;
  showActions?: boolean;
  onViewWallet?: (address: string) => void;
  onExportWallet?: (characterId: string) => void;
}

/**
 * Format wallet address for display (0x1234...5678)
 */
function formatAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Get blockchain explorer URL for address
 */
function getExplorerUrl(address: string, chainType: string): string {
  const explorers: Record<string, string> = {
    ethereum: `https://etherscan.io/address/${address}`,
    polygon: `https://polygonscan.com/address/${address}`,
    arbitrum: `https://arbiscan.io/address/${address}`,
    optimism: `https://optimistic.etherscan.io/address/${address}`,
    base: `https://basescan.org/address/${address}`,
    solana: `https://solscan.io/address/${address}`,
  };

  return explorers[chainType] || explorers.ethereum;
}

/**
 * Get chain icon/emoji
 */
function getChainIcon(chainType: string): string {
  const icons: Record<string, string> = {
    ethereum: "⟠",
    polygon: "⬟",
    arbitrum: "🔷",
    optimism: "🔴",
    base: "🔵",
    solana: "◎",
    bitcoin: "₿",
  };

  return icons[chainType] || "🔗";
}

/**
 * CharacterWalletDisplay Component
 *
 * Displays wallet information for a character/agent with optional
 * balance display and quick actions.
 */
export function CharacterWalletDisplay({
  character,
  showBalance = false,
  showActions = true,
  onViewWallet,
  onExportWallet,
}: CharacterWalletDisplayProps) {
  const [copied, setCopied] = React.useState(false);

  if (!character.hasWallet || !character.wallet) {
    return (
      <div className="wallet-display no-wallet">
        <div className="wallet-icon">🔒</div>
        <div className="wallet-text">
          <span className="wallet-status">No Wallet</span>
          <span className="wallet-hint">Create wallet in settings</span>
        </div>
      </div>
    );
  }

  const { wallet } = character;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy address:", error);
    }
  };

  const viewOnExplorer = () => {
    const url = getExplorerUrl(wallet.address, wallet.chainType);
    window.open(url, "_blank");
  };

  return (
    <div className="wallet-display has-wallet">
      <div className="wallet-header">
        <span className="chain-icon">{getChainIcon(wallet.chainType)}</span>
        <span className="chain-name">{wallet.chainType.toUpperCase()}</span>
        {wallet.hdIndex !== undefined && (
          <span className="hd-index">#{wallet.hdIndex}</span>
        )}
      </div>

      <div className="wallet-address">
        <span className="address-text" title={wallet.address}>
          {formatAddress(wallet.address)}
        </span>
        <button
          onClick={copyAddress}
          className="copy-button"
          title="Copy address"
        >
          {copied ? "✓" : "📋"}
        </button>
      </div>

      {showBalance && (
        <div className="wallet-balance">
          <div className="balance-item">
            <span className="balance-label">Balance</span>
            <span className="balance-value">
              {wallet.balance || "0.00"} ETH
            </span>
          </div>
          {wallet.nftCount !== undefined && (
            <div className="balance-item">
              <span className="balance-label">NFTs</span>
              <span className="balance-value">{wallet.nftCount}</span>
            </div>
          )}
        </div>
      )}

      {showActions && (
        <div className="wallet-actions">
          <button onClick={viewOnExplorer} className="action-button">
            🔍 View on Explorer
          </button>
          {onViewWallet && (
            <button
              onClick={() => onViewWallet(wallet.address)}
              className="action-button"
            >
              👛 View Wallet
            </button>
          )}
          {onExportWallet && (
            <button
              onClick={() => onExportWallet(character.id)}
              className="action-button"
            >
              📤 Export
            </button>
          )}
        </div>
      )}

      <style>{`
        .wallet-display {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          backdrop-filter: blur(10px);
        }

        .wallet-display.no-wallet {
          flex-direction: row;
          align-items: center;
          gap: 12px;
          opacity: 0.6;
        }

        .wallet-icon {
          font-size: 24px;
        }

        .wallet-text {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .wallet-status {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        .wallet-hint {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }

        .wallet-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
        }

        .chain-icon {
          font-size: 16px;
        }

        .chain-name {
          flex: 1;
        }

        .hd-index {
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          font-size: 10px;
        }

        .wallet-address {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          font-family: monospace;
        }

        .address-text {
          flex: 1;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
        }

        .copy-button {
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .copy-button:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .wallet-balance {
          display: flex;
          gap: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
        }

        .balance-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .balance-label {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .balance-value {
          font-size: 16px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        .wallet-actions {
          display: flex;
          gap: 8px;
        }

        .action-button {
          flex: 1;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.9);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-button:hover {
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .action-button:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}

/**
 * Compact wallet badge for inline display
 */
export function WalletBadge({
  wallet,
  size = "small",
}: {
  wallet: CharacterWallet;
  size?: "small" | "medium" | "large";
}) {
  const sizeClasses = {
    small: "wallet-badge-small",
    medium: "wallet-badge-medium",
    large: "wallet-badge-large",
  };

  return (
    <div className={`wallet-badge ${sizeClasses[size]}`}>
      <span className="badge-icon">{getChainIcon(wallet.chainType)}</span>
      <span className="badge-address">{formatAddress(wallet.address)}</span>

      <style>{`
        .wallet-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          font-family: monospace;
        }

        .wallet-badge-small {
          font-size: 10px;
          padding: 2px 6px;
        }

        .wallet-badge-medium {
          font-size: 12px;
          padding: 4px 8px;
        }

        .wallet-badge-large {
          font-size: 14px;
          padding: 6px 10px;
        }

        .badge-icon {
          opacity: 0.8;
        }

        .badge-address {
          color: rgba(255, 255, 255, 0.9);
        }
      `}</style>
    </div>
  );
}
