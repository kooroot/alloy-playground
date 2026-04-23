export interface paths {
    "/api/account/{addr}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["get_account"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/erc20/balance/{holder}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["balance_of"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/erc20/deploy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["deploy"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/erc20/transfer/build": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["transfer_build"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/erc20/transfer/send-local": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["transfer_send_local"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/network": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["get_network"];
        put?: never;
        post: operations["post_network"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tx/eth/build": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["build_eth_tx"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tx/eth/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["send_raw_tx"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tx/eth/send-local": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["send_local_tx"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/wallet/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["current"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/wallet/from-mnemonic": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["from_mnemonic"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/wallet/new": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["new_random"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/wallet/new-mnemonic": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["new_mnemonic"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/wallet/use": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["use_key"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AccountInfo: {
            /**
             * @description Checksummed 20-byte address, `0x`-prefixed hex.
             * @example 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
             */
            address: string;
            /**
             * @description Balance in wei. Serialized as a decimal string to avoid JS number precision loss.
             * @example 10000000000000000000000
             */
            balance_wei: string;
            /** Format: int64 */
            nonce: number;
        };
        BalanceResponse: {
            /** @example 100000000000000000000 */
            balance: string;
            holder: string;
            token: string;
        };
        BuildEthTxRequest: {
            /**
             * @description Sender address. For MetaMask flow this is `window.ethereum.selectedAddress`.
             * @example 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
             */
            from: string;
            /** @example 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 */
            to: string;
            /**
             * @description Value in wei, decimal-string to survive JS number precision.
             * @example 1000000000000000000
             */
            value_wei: string;
        };
        CurrentSignerResponse: {
            /**
             * @description `None` when the server is running without a signer (e.g. PRIVATE_KEY
             *     missing from .env and no hot-swap has happened yet).
             */
            address?: string | null;
        };
        DeployRequest: {
            /**
             * @description Initial supply in smallest units (wei-scale for 18-decimal tokens).
             *     Decimal-string to survive JS number precision.
             * @example 1000000000000000000000000
             */
            initial_supply: string;
            /** @example DemoToken */
            name: string;
            /** @example DEMO */
            symbol: string;
        };
        DeployResponse: {
            address: string;
            tx_hash: string;
        };
        Erc20TxHashResponse: {
            tx_hash: string;
        };
        FromMnemonicRequest: {
            /**
             * Format: int32
             * @description BIP-44 child index (defaults to 0 = first account).
             */
            index?: number;
            /** @example test test test test test test test test test test test junk */
            phrase: string;
        };
        GeneratedWallet: {
            address: string;
            /** @description `Some(...)` only on the mnemonic endpoints. Space-separated 12 words. */
            mnemonic?: string | null;
            /** @description 0x-prefixed 32-byte hex. */
            private_key: string;
        };
        HealthResponse: {
            ok: boolean;
            service: string;
        };
        /** @enum {string} */
        Network: "anvil" | "sepolia";
        NetworkInfo: {
            /** Format: int64 */
            chain_id: number;
            /** Format: int64 */
            latest_block: number;
            network: components["schemas"]["Network"];
        };
        SendLocalTxRequest: {
            /** @example 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 */
            to: string;
            /** @example 1000000000000000000 */
            value_wei: string;
        };
        SendRawTxRequest: {
            /**
             * @description Hex-encoded signed RLP (0x-prefixed), as produced by e.g.
             *     `walletClient.signTransaction(...)` in viem.
             * @example 0x02f8...
             */
            raw_tx: string;
        };
        SwitchNetworkRequest: {
            network: components["schemas"]["Network"];
        };
        TransferBuildRequest: {
            amount: string;
            from: string;
            to: string;
            /** @example 0x… */
            token?: string | null;
        };
        TransferLocalRequest: {
            /** @example 100000000000000000000 */
            amount: string;
            /** @example 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 */
            to: string;
            /**
             * @description Defaults to last-deployed address if omitted.
             * @example 0x…
             */
            token?: string | null;
        };
        TxHashResponse: {
            /** @example 0xabc… */
            tx_hash: string;
        };
        /**
         * @description Shape matches MetaMask's `eth_sendTransaction` param format — hex-prefixed
         *     strings across the board so the browser can pass it through unchanged.
         */
        UnsignedEip1559Tx: {
            chain_id: string;
            from: string;
            gas: string;
            max_fee_per_gas: string;
            max_priority_fee_per_gas: string;
            nonce: string;
            to: string;
            /** @description Always `"0x2"` (EIP-1559). */
            type: string;
            /** @description Hex-encoded wei. E.g. `"0xde0b6b3a7640000"` for 1 ETH. */
            value: string;
        };
        UnsignedTransferTx: {
            chain_id: string;
            data: string;
            from: string;
            gas: string;
            max_fee_per_gas: string;
            max_priority_fee_per_gas: string;
            nonce: string;
            /**
             * @description Destination is the token contract — the `to` recipient is encoded in
             *     the calldata.
             */
            to: string;
            type: string;
            value: string;
        };
        UseKeyRequest: {
            /**
             * @description 0x-prefixed 32-byte hex private key.
             * @example 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
             */
            private_key: string;
        };
        UseKeyResponse: {
            address: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    get_account: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Ethereum address (0x-prefixed hex) */
                addr: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountInfo"];
                };
            };
        };
    };
    balance_of: {
        parameters: {
            query?: {
                /** @description Token address; defaults to last-deployed */
                token?: string;
            };
            header?: never;
            path: {
                /** @description 0x-address to query */
                holder: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BalanceResponse"];
                };
            };
        };
    };
    deploy: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeployRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeployResponse"];
                };
            };
        };
    };
    transfer_build: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransferBuildRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnsignedTransferTx"];
                };
            };
        };
    };
    transfer_send_local: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransferLocalRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Erc20TxHashResponse"];
                };
            };
        };
    };
    health: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    get_network: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetworkInfo"];
                };
            };
        };
    };
    post_network: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwitchNetworkRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetworkInfo"];
                };
            };
        };
    };
    build_eth_tx: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuildEthTxRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnsignedEip1559Tx"];
                };
            };
        };
    };
    send_raw_tx: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendRawTxRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TxHashResponse"];
                };
            };
        };
    };
    send_local_tx: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendLocalTxRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TxHashResponse"];
                };
            };
        };
    };
    current: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentSignerResponse"];
                };
            };
        };
    };
    from_mnemonic: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FromMnemonicRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GeneratedWallet"];
                };
            };
        };
    };
    new_random: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GeneratedWallet"];
                };
            };
        };
    };
    new_mnemonic: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GeneratedWallet"];
                };
            };
        };
    };
    use_key: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UseKeyRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UseKeyResponse"];
                };
            };
        };
    };
}
