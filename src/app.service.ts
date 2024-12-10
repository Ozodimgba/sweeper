import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  ParsedAccountData,
  PublicKey,
  TransactionConfirmationStrategy,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { TransactionBuilder } from './engine';

export interface RawMint {
  mintAuthorityOption: 1 | 0;
  mintAuthority: PublicKey;
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthorityOption: 1 | 0;
  freezeAuthority: PublicKey;
}

@Injectable()
export class AppService implements OnModuleInit {
  private solanaConnection: Connection;
  private tokenMintAddress: PublicKey | null = null;
  private accountsToMonitor: PublicKey[] = [];
  private ME_MINT: string = 'MEFNBXixkEbait3xn9bkm8WsJzXtVsaJEn4c8Sam21u';
  private USDC_MINT: string = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  private transferCounter = 0;
  private MAX_TRANSFERS = 5;
  private wallet: Keypair;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.solanaConnection = new Connection(this.configService.get('RPC'), {
      wsEndpoint: this.configService.get('WS'),
    });
    // Initialize wallet in constructor
    this.wallet = Keypair.fromSecretKey(
      bs58.decode(this.configService.get('PRIVATE_KEY')),
    );
  }

  getHello(): string {
    return 'Hello World!';
  }

  onModuleInit() {
    console.log('USDC Service initialized. Ready to start listening...');
  }

  async getOrcreateATA() {
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      this.solanaConnection,
      this.wallet,
      new PublicKey(this.ME_MINT),
      new PublicKey('6Gi79sB8sRQSLAJdFeC3E8xK1kuvhLiZgWcDviqHiwd7'),
      true,
    );

    console.log(tokenAccount.address);

    // createAssociatedTokenAccountInstruction(this.wallet);
  }

  //230, //40
  async getNumberDecimals(mintAddress: string): Promise<number> {
    const info = await this.solanaConnection.getParsedAccountInfo(
      new PublicKey(mintAddress),
    );
    const result = (info.value?.data as ParsedAccountData).parsed.info
      .decimals as number;
    return result;
  }

  async handleTransfer() {
    try {
      const decimals = await this.getNumberDecimals(this.USDC_MINT);

      const myWalletATA = getOrCreateAssociatedTokenAccount(
        this.solanaConnection,
        this.wallet,
        new PublicKey(this.USDC_MINT),
        this.wallet.publicKey,
        true,
      );

      const receiver = new PublicKey(
        'D7s1hdsBUZTsYNQjoJaHCgpfMp1iRveTSLvsWfCzzQXJ',
      );

      const receiverATA = getOrCreateAssociatedTokenAccount(
        this.solanaConnection,
        this.wallet,
        new PublicKey(this.USDC_MINT),
        receiver,
        true,
      );

      const ix = await createTransferInstruction(
        (await myWalletATA).address,
        (await receiverATA).address,
        this.wallet.publicKey,
        0.001 * Math.pow(10, decimals),
      );

      const latestblockhash = this.solanaConnection.getLatestBlockhash();

      const tx = TransactionBuilder.create(
        this.solanaConnection,
        this.wallet.publicKey,
        [ix],
        this.configService.get('RPC'),
      )
        .setBlockhash((await latestblockhash).blockhash)
        .setComputeLimitMultiple(1.5)
        .setAutoComputeUnitPrice('veryHigh')
        .then((builder: TransactionBuilder) =>
          builder.setAutoComputeUnitLimit(),
        )
        .then((builder: TransactionBuilder) => builder.build());

      (await tx).sign([this.wallet]);

      const signature = await this.solanaConnection.sendTransaction(await tx);

      const strategy: TransactionConfirmationStrategy = {
        blockhash: (await latestblockhash).blockhash,
        lastValidBlockHeight: (await latestblockhash).lastValidBlockHeight,
        signature: signature,
      };

      await this.solanaConnection.confirmTransaction(strategy, 'confirmed');

      console.log(
        '\x1b[32m', //Green Text
        `   Transaction Success!🎉`,
        `\n    https://explorer.solana.com/tx/${signature}`,
      );

      return {
        success: true,
        signature,
        message: 'Transaction completed successfully',
      };
    } catch (error) {
      console.error('\x1b[31m', 'Transaction failed:', error.message); // Red text for errors

      // Log detailed error information for debugging
      if (error.logs) {
        console.error('Error logs:', error.logs);
      }

      // Determine specific error type and provide appropriate message
      let errorMessage = 'Transaction failed: ';

      if (error.message.includes('insufficient funds')) {
        errorMessage += 'Insufficient funds in wallet';
      } else if (error.message.includes('blockhash')) {
        errorMessage += 'Blockhash expired, please try again';
      } else if (error.message.includes('Account does not exist')) {
        errorMessage += 'Associated token account does not exist';
      } else {
        errorMessage += error.message;
      }

      console.log(errorMessage);
    }
  }

  async startListening() {
    this.tokenMintAddress = new PublicKey(this.USDC_MINT);

    console.log('Wallet listening ' + this.wallet.publicKey.toString());

    const walletsToListenFor = [this.wallet.publicKey];

    walletsToListenFor.forEach(async (account) => {
      try {
        const myWalletATA = getOrCreateAssociatedTokenAccount(
          this.solanaConnection,
          this.wallet,
          new PublicKey(this.USDC_MINT),
          this.wallet.publicKey,
          true,
        );

        await this.solanaConnection.onAccountChange(
          (await myWalletATA).address,
          async (incomingInfo) => {
            this.transferCounter += 1;

            if (this.transferCounter <= this.MAX_TRANSFERS) {
              console.log('Handling transfer tx', incomingInfo);
              await this.handleTransfer();
            } else {
            }
          },
          'processed',
        );
        console.log(
          `Monitoring associated token account: ${(await myWalletATA).address.toBase58()} for account ${account.toBase58()}`,
        );
      } catch (error) {
        console.error(
          `Error setting up listener for account ${account.toBase58()}:`,
          error,
        );
      }
    });
    console.log(`Started listening to ${walletsToListenFor.length} accounts`);
  }
}
