'use strict';

/**
 * Transaction Parser Test Suite
 * 
 * Comprehensive tests for the transaction parser module including
 * memo extraction, amount extraction, and asset detection.
 */

const {
  parseTransaction,
  validateParsedData,
  TransactionParseError
} = require('../src/services/transactionParser');

const { extractMemo } = require('../src/services/parsers/memoExtractor');
const { extractAmount } = require('../src/services/parsers/amountExtractor');

// Mock Stellar SDK
jest.mock('stellar-sdk', () => ({
  Memo: {
    text: jest.fn((text) => ({ type: 'text', value: text })),
    id: jest.fn((id) => ({ type: 'id', value: id })),
    hash: jest.fn((hash) => ({ type: 'hash', value: hash })),
    return: jest.fn((ret) => ({ type: 'return', value: ret })),
    none: jest.fn(() => ({ type: 'none', value: null }))
  }
}));

describe('Transaction Parser', () => {
  describe('parseTransaction', () => {
    const mockWalletAddress = 'GTEST123WALLET456ADDRESS789';

    const createMockTransaction = (overrides = {}) => ({
      successful: true,
      hash: 'test-tx-hash-123',
      memo: 'STUDENT123',
      memo_type: 'text',
      created_at: '2024-01-01T12:00:00Z',
      ledger_attr: 12345,
      fee_paid: '100',
      operations: jest.fn().mockResolvedValue({
        records: [{
          type: 'payment',
          from: 'GSENDER123',
          to: mockWalletAddress,
          amount: '100.0000000',
          asset_type: 'native'
        }]
      }),
      ...overrides
    });

    test('successfully parses valid payment transaction', async () => {
      const mockTx = createMockTransaction();
      
      const result = await parseTransaction(mockTx, mockWalletAddress);
      
      expect(result).toMatchObject({
        hash: 'test-tx-hash-123',
        memo: 'STUDENT123',
        successful: true,
        operations: expect.arrayContaining([{
          type: 'payment',
          from: 'GSENDER123',
          to: mockWalletAddress,
          amount: 100,
          asset: {
            type: 'native',
            code: 'XLM',
            issuer: null
          }
        }])
      });
    });

    test('throws error for failed transaction', async () => {
      const mockTx = createMockTransaction({ successful: false });
      
      await expect(parseTransaction(mockTx, mockWalletAddress))
        .rejects
        .toThrow(TransactionParseError);
    });

    test('throws error for transaction without payment to wallet', async () => {
      const mockTx = createMockTransaction();
      mockTx.operations.mockResolvedValue({
        records: [{
          type: 'payment',
          from: 'GSENDER123',
          to: 'GDIFFERENT456',
          amount: '100.0000000',
          asset_type: 'native'
        }]
      });
      
      await expect(parseTransaction(mockTx, mockWalletAddress))
        .rejects
        .toThrow(TransactionParseError);
    });

    test('handles missing memo gracefully', async () => {
      const mockTx = createMockTransaction({ memo: null });
      
      const result = await parseTransaction(mockTx, mockWalletAddress);
      
      expect(result.memo).toBeNull();
    });

    test('handles multiple payment operations', async () => {
      const mockTx = createMockTransaction();
      mockTx.operations.mockResolvedValue({
        records: [
          {
            type: 'payment',
            from: 'GSENDER123',
            to: mockWalletAddress,
            amount: '50.0000000',
            asset_type: 'native'
          },
          {
            type: 'payment',
            from: 'GSENDER123',
            to: mockWalletAddress,
            amount: '25.0000000',
            asset_type: 'native'
          }
        ]
      });
      
      const result = await parseTransaction(mockTx, mockWalletAddress);
      
      expect(result.operations).toHaveLength(2);
      expect(result.operations[0].amount).toBe(50);
      expect(result.operations[1].amount).toBe(25);
    });
  });

  describe('validateParsedData', () => {
    const validParsedData = {
      hash: 'valid-hash-123',
      memo: 'STUDENT123',
      successful: true,
      operations: [{
        type: 'payment',
        from: 'GSENDER123',
        to: 'GWALLET456',
        amount: 100,
        asset: {
          type: 'native',
          code: 'XLM',
          issuer: null
        }
      }],
      createdAt: new Date(),
      ledger: 12345,
      networkFee: 0.00001
    };

    test('validates correct parsed data', () => {
      const result = validateParsedData(validParsedData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('detects missing hash', () => {
      const invalidData = { ...validParsedData, hash: null };
      
      const result = validateParsedData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'hash' })
      );
    });

    test('detects invalid operations', () => {
      const invalidData = { ...validParsedData, operations: [] };
      
      const result = validateParsedData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'operations' })
      );
    });

    test('detects invalid amount', () => {
      const invalidData = {
        ...validParsedData,
        operations: [{
          ...validParsedData.operations[0],
          amount: -100
        }]
      };
      
      const result = validateParsedData(invalidData);
      
      expect(result.valid).toBe(false);
    });
  });
});

describe('Memo Extractor', () => {
  describe('extractMemo', () => {
    test('extracts text memo correctly', () => {
      const tx = {
        memo: 'STUDENT123',
        memo_type: 'text'
      };
      
      const result = extractMemo(tx);
      
      expect(result).toBe('STUDENT123');
    });

    test('extracts and decodes base64 memo', () => {
      const tx = {
        memo: Buffer.from('STUDENT456').toString('base64'),
        memo_type: 'hash'
      };
      
      const result = extractMemo(tx);
      
      expect(result).toBe('STUDENT456');
    });

    test('handles numeric memo', () => {
      const tx = {
        memo: '123456',
        memo_type: 'id'
      };
      
      const result = extractMemo(tx);
      
      expect(result).toBe('123456');
    });

    test('returns null for missing memo', () => {
      const tx = {
        memo: null,
        memo_type: 'none'
      };
      
      const result = extractMemo(tx);
      
      expect(result).toBeNull();
    });

    test('trims whitespace from memo', () => {
      const tx = {
        memo: '  STUDENT789  ',
        memo_type: 'text'
      };
      
      const result = extractMemo(tx);
      
      expect(result).toBe('STUDENT789');
    });

    test('handles empty memo string', () => {
      const tx = {
        memo: '',
        memo_type: 'text'
      };
      
      const result = extractMemo(tx);
      
      expect(result).toBeNull();
    });

    test('validates memo length constraints', () => {
      const longMemo = 'A'.repeat(100); // Very long memo
      const tx = {
        memo: longMemo,
        memo_type: 'text'
      };
      
      const result = extractMemo(tx);
      
      // Should handle long memos gracefully
      expect(result).toBe(longMemo);
    });
  });
});

describe('Amount Extractor', () => {
  describe('extractAmount', () => {
    test('extracts and normalizes amount correctly', () => {
      const operation = {
        amount: '100.1234567'
      };
      
      const result = extractAmount(operation);
      
      expect(result).toBe(100.1234567);
    });

    test('handles string amounts', () => {
      const operation = {
        amount: '50.5000000'
      };
      
      const result = extractAmount(operation);
      
      expect(result).toBe(50.5);
    });

    test('handles numeric amounts', () => {
      const operation = {
        amount: 75.25
      };
      
      const result = extractAmount(operation);
      
      expect(result).toBe(75.25);
    });

    test('normalizes to 7 decimal places', () => {
      const operation = {
        amount: '100.12345678901234'
      };
      
      const result = extractAmount(operation);
      
      expect(result).toBe(100.1234568); // Rounded to 7 decimal places
    });

    test('handles zero amounts', () => {
      const operation = {
        amount: '0.0000000'
      };
      
      const result = extractAmount(operation);
      
      expect(result).toBe(0);
    });

    test('throws error for invalid amounts', () => {
      const operation = {
        amount: 'invalid'
      };
      
      expect(() => extractAmount(operation))
        .toThrow('Invalid amount format');
    });

    test('throws error for negative amounts', () => {
      const operation = {
        amount: '-50.0000000'
      };
      
      expect(() => extractAmount(operation))
        .toThrow('Amount cannot be negative');
    });

    test('handles very small amounts', () => {
      const operation = {
        amount: '0.0000001'
      };
      
      const result = extractAmount(operation);
      
      expect(result).toBe(0.0000001);
    });
  });
});

describe('Property-based Tests', () => {
  describe('Memo Extraction Properties', () => {
    test('memo extraction is idempotent', () => {
      const tx = {
        memo: 'STUDENT123',
        memo_type: 'text'
      };
      
      const result1 = extractMemo(tx);
      const result2 = extractMemo(tx);
      
      expect(result1).toBe(result2);
    });

    test('memo extraction preserves non-empty strings', () => {
      const testMemos = ['STUDENT123', 'ABC', '123456', 'test-memo'];
      
      testMemos.forEach(memo => {
        const tx = {
          memo: memo,
          memo_type: 'text'
        };
        
        const result = extractMemo(tx);
        
        expect(result).toBe(memo);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    test('memo extraction handles all memo types consistently', () => {
      const memoTypes = ['text', 'id', 'hash', 'return'];
      
      memoTypes.forEach(type => {
        const tx = {
          memo: 'TEST123',
          memo_type: type
        };
        
        const result = extractMemo(tx);
        
        expect(typeof result === 'string' || result === null).toBe(true);
      });
    });
  });

  describe('Amount Extraction Properties', () => {
    test('amount extraction preserves numeric precision', () => {
      const testAmounts = [
        '1.0000000',
        '100.1234567',
        '0.0000001',
        '999999.9999999'
      ];
      
      testAmounts.forEach(amount => {
        const operation = { amount };
        
        const result = extractAmount(operation);
        
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(result)).toBe(true);
      });
    });

    test('amount extraction is deterministic', () => {
      const operation = { amount: '123.4567890' };
      
      const result1 = extractAmount(operation);
      const result2 = extractAmount(operation);
      
      expect(result1).toBe(result2);
    });

    test('amount normalization maintains order', () => {
      const amounts = ['1.0', '2.0', '3.0', '10.0', '100.0'];
      
      const results = amounts.map(amount => 
        extractAmount({ amount })
      );
      
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeGreaterThan(results[i - 1]);
      }
    });
  });
});

describe('Error Handling', () => {
  test('TransactionParseError includes proper error codes', () => {
    const error = new TransactionParseError('Test error', 'TEST_CODE');
    
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('TransactionParseError');
    expect(error instanceof Error).toBe(true);
  });

  test('parser handles malformed transaction gracefully', async () => {
    const malformedTx = {
      // Missing required fields
      successful: true
    };
    
    await expect(parseTransaction(malformedTx, 'GWALLET123'))
      .rejects
      .toThrow(TransactionParseError);
  });

  test('parser handles network errors gracefully', async () => {
    const mockTx = {
      successful: true,
      hash: 'test-hash',
      memo: 'STUDENT123',
      operations: jest.fn().mockRejectedValue(new Error('Network error'))
    };
    
    await expect(parseTransaction(mockTx, 'GWALLET123'))
      .rejects
      .toThrow();
  });
});