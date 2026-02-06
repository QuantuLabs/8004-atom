/**
 * Initialize Localnet for Testing
 * Must be run FIRST before other tests to set up ATOM engine
 *
 * NOTE: Agent Registry is cloned from devnet, so it's already initialized.
 * We only need to initialize ATOM Engine for local testing.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { AtomEngine } from "../types/atom_engine";
import { AgentRegistry8004 } from "../types/agent_registry_8004";
import { Keypair, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

import {
  MPL_CORE_PROGRAM_ID,
  ATOM_ENGINE_PROGRAM_ID,
  getRootConfigPda,
  getRegistryConfigPda,
  getAtomConfigPda,
  getValidationConfigPda,
} from "./utils/helpers";

// Registry program ID (cloned from devnet)
const REGISTRY_PROGRAM_ID = new PublicKey("8oo4SbcgjRBAXjmGU4YMcdFqfeLLrtn7n6f358PkAc3N");

/**
 * Get the registry program from IDL (since it's cloned, not in workspace)
 */
function getRegistryProgram(provider: anchor.AnchorProvider): Program<AgentRegistry8004> {
  const idl = require("../idl/agent_registry_8004.json");
  return new anchor.Program(idl, provider) as unknown as Program<AgentRegistry8004>;
}

describe("Initialize Localnet", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // ATOM Engine is in our workspace
  const atomEngine = anchor.workspace.AtomEngine as Program<AtomEngine>;

  // Registry is cloned from devnet, load via IDL
  const registry = getRegistryProgram(provider);

  let rootConfigPda: PublicKey;

  before(async () => {
    console.log("\n=== Localnet Initialization ===");
    console.log("Provider wallet:", provider.wallet.publicKey.toBase58());
    console.log("Registry Program ID:", registry.programId.toBase58());
    console.log("ATOM Engine ID:", atomEngine.programId.toBase58());

    [rootConfigPda] = getRootConfigPda(registry.programId);

    // Registry is cloned from devnet - check if it exists
    const accountInfo = await provider.connection.getAccountInfo(rootConfigPda);
    if (accountInfo !== null) {
      console.log("Registry cloned from devnet - already initialized");
      try {
        const rootConfig = await registry.account.rootConfig.fetch(rootConfigPda);
        console.log("Current base registry:", rootConfig.baseRegistry.toBase58());
      } catch (e) {
        console.log("Could not fetch root config (may be cloned but accounts differ)");
      }
    } else {
      console.log("Warning: Registry not found - ensure devnet clone is working");
    }
  });

  it("Check Registry is cloned from devnet", async () => {
    // Registry should be cloned from devnet
    const accountInfo = await provider.connection.getAccountInfo(rootConfigPda);
    if (accountInfo === null) {
      console.log("Registry not found - localnet may not have cloned it properly");
      console.log("Tests that require registry CPI will fail");
      return;
    }

    console.log("Registry program cloned successfully");
    console.log("  Root Config PDA:", rootConfigPda.toBase58());
  });

  it("Initialize ATOM Engine (if needed)", async () => {
    const [atomConfigPda] = getAtomConfigPda(atomEngine.programId);

    // Check if already initialized
    const accountInfo = await provider.connection.getAccountInfo(atomConfigPda);
    if (accountInfo !== null) {
      console.log("ATOM Engine already initialized - skipping");
      return;
    }

    console.log("Initializing ATOM Engine...");
    console.log("  Config PDA:", atomConfigPda.toBase58());
    console.log("  Agent Registry Program:", registry.programId.toBase58());

    const tx = await atomEngine.methods
      .initializeConfig(registry.programId)
      .accounts({
        config: atomConfigPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("ATOM Initialize tx:", tx);

    // Verify initialization
    const atomConfig = await atomEngine.account.atomConfig.fetch(atomConfigPda);
    expect(atomConfig.authority.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    expect(atomConfig.agentRegistryProgram.toBase58()).to.equal(registry.programId.toBase58());

    console.log("ATOM Engine initialized successfully!");
  });

  it("Display final state", async () => {
    console.log("\n=== Final Localnet State ===");

    // Root Config (from cloned registry)
    try {
      const rootConfig = await registry.account.rootConfig.fetch(rootConfigPda);
      console.log("\nRoot Config (cloned from devnet):");
      console.log("  Authority:", rootConfig.authority.toBase58());
      console.log("  Base Registry:", rootConfig.baseRegistry.toBase58());
    } catch (e) {
      console.log("\nRoot Config: Not available (clone may have failed)");
    }

    // ATOM Config
    const [atomConfigPda] = getAtomConfigPda(atomEngine.programId);
    try {
      const atomConfig = await atomEngine.account.atomConfig.fetch(atomConfigPda);
      console.log("\nATOM Config:");
      console.log("  Authority:", atomConfig.authority.toBase58());
      console.log("  Agent Registry Program:", atomConfig.agentRegistryProgram.toBase58());
    } catch (e) {
      console.log("\nATOM Config: Not initialized");
    }

    console.log("\n=== Localnet Ready for Testing ===\n");
  });
});
