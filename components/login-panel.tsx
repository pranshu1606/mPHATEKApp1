"use client";

import { signIn } from "next-auth/react";

type LoginPanelProps = {
  providers: Array<{
    id: string;
    name: string;
  }>;
  callbackUrl?: string;
  buttonPrefix?: string;
};

export function LoginPanel({ providers, callbackUrl = "/dashboard", buttonPrefix = "Continue with" }: LoginPanelProps) {
  if (providers.length === 0) {
    return (
      <div className="empty-state">
        <h2>No OAuth providers configured</h2>
        <p>Add GitHub or Google credentials in `.env` and restart the app.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {providers.map((provider) => (
        <button
          key={provider.id}
          className="primary-button"
          onClick={() => signIn(provider.id, { callbackUrl })}
          type="button"
        >
          {buttonPrefix} {provider.name}
        </button>
      ))}
    </div>
  );
}
