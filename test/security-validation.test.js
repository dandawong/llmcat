/**
 * Security Validation Tests
 * 
 * Tests for the security improvements implemented in content script injection.
 * These tests verify that the security validators work correctly and prevent
 * malicious script injection.
 */

// Mock chrome runtime for testing
const mockChrome = {
    runtime: {
        id: 'test-extension-id',
        getURL: (path) => `chrome-extension://test-extension-id/${path}`
    }
};

// Mock global chrome object
global.chrome = mockChrome;

// Recreate the essential parts for testing
class TestSecurityValidator {
    static ALLOWED_SCRIPTS = [
        'scripts/capture/interceptor.js',
        'scripts/capture/platforms/chatgpt.js',
        'scripts/capture/platforms/gemini.js',
        'scripts/capture/platforms/claude.js',
        'scripts/capture/platforms/tongyi.js',
        'scripts/capture/platforms/deepseek.js',
        'scripts/capture/platforms/kimi.js',
        'modules/logger.js'
    ];

    static isValidExtensionURL(url) {
        try {
            const urlObj = new URL(url);
            
            if (urlObj.protocol !== 'chrome-extension:') {
                return false;
            }
            
            if (urlObj.hostname !== mockChrome.runtime.id) {
                return false;
            }
            
            const path = urlObj.pathname.substring(1);
            return this.ALLOWED_SCRIPTS.includes(path);
        } catch (error) {
            return false;
        }
    }

    static validateCSPCompliance(url) {
        try {
            const urlObj = new URL(url);
            
            if (urlObj.protocol !== 'chrome-extension:' || urlObj.hostname !== mockChrome.runtime.id) {
                return false;
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }

    static validateXSSProtection(url) {
        try {
            new URL(url);
            
            const suspiciousPatterns = [
                /javascript:/i,
                /data:/i,
                /blob:/i,
                /vbscript:/i,
                /<script/i,
                /eval\(/i,
                /Function\(/i
            ];
            
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(url)) {
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }
}

describe('Security Validation', () => {

    describe('URL Validation', () => {
        test('should accept valid extension URLs', () => {
            const validUrl = 'chrome-extension://test-extension-id/scripts/capture/interceptor.js';
            expect(TestSecurityValidator.isValidExtensionURL(validUrl)).toBe(true);
        });

        test('should reject non-extension URLs', () => {
            const invalidUrl = 'https://malicious-site.com/script.js';
            expect(TestSecurityValidator.isValidExtensionURL(invalidUrl)).toBe(false);
        });

        test('should reject URLs from different extensions', () => {
            const invalidUrl = 'chrome-extension://different-extension-id/script.js';
            expect(TestSecurityValidator.isValidExtensionURL(invalidUrl)).toBe(false);
        });

        test('should reject unauthorized script paths', () => {
            const invalidUrl = 'chrome-extension://test-extension-id/unauthorized/script.js';
            expect(TestSecurityValidator.isValidExtensionURL(invalidUrl)).toBe(false);
        });
    });

    describe('CSP Validation', () => {
        test('should pass CSP validation for extension scripts', () => {
            const validUrl = 'chrome-extension://test-extension-id/scripts/capture/interceptor.js';
            expect(TestSecurityValidator.validateCSPCompliance(validUrl)).toBe(true);
        });

        test('should fail CSP validation for external scripts', () => {
            const invalidUrl = 'https://external-site.com/script.js';
            expect(TestSecurityValidator.validateCSPCompliance(invalidUrl)).toBe(false);
        });
    });

    describe('XSS Protection', () => {
        test('should pass XSS validation for safe URLs', () => {
            const safeUrl = 'chrome-extension://test-extension-id/scripts/capture/interceptor.js';
            expect(TestSecurityValidator.validateXSSProtection(safeUrl)).toBe(true);
        });

        test('should block javascript: URLs', () => {
            const maliciousUrl = 'javascript:alert("xss")';
            expect(TestSecurityValidator.validateXSSProtection(maliciousUrl)).toBe(false);
        });

        test('should block data: URLs', () => {
            const maliciousUrl = 'data:text/html,<script>alert("xss")</script>';
            expect(TestSecurityValidator.validateXSSProtection(maliciousUrl)).toBe(false);
        });

        test('should block URLs with script tags', () => {
            const maliciousUrl = 'chrome-extension://test-extension-id/<script>alert("xss")</script>';
            expect(TestSecurityValidator.validateXSSProtection(maliciousUrl)).toBe(false);
        });

        test('should block URLs with eval patterns', () => {
            const maliciousUrl = 'chrome-extension://test-extension-id/eval(malicious)';
            expect(TestSecurityValidator.validateXSSProtection(maliciousUrl)).toBe(false);
        });
    });

    describe('Platform Module Validation', () => {
        test('should accept all supported platform modules', () => {
            const platforms = ['chatgpt.js', 'gemini.js', 'claude.js', 'tongyi.js', 'deepseek.js', 'kimi.js'];

            platforms.forEach(platform => {
                const url = `chrome-extension://test-extension-id/scripts/capture/platforms/${platform}`;
                expect(TestSecurityValidator.isValidExtensionURL(url)).toBe(true);
            });
        });

        test('should reject unsupported platform modules', () => {
            const invalidUrl = 'chrome-extension://test-extension-id/scripts/capture/platforms/malicious.js';
            expect(TestSecurityValidator.isValidExtensionURL(invalidUrl)).toBe(false);
        });
    });

    describe('Logger Module Validation', () => {
        test('should accept logger module', () => {
            const loggerUrl = 'chrome-extension://test-extension-id/modules/logger.js';
            expect(TestSecurityValidator.isValidExtensionURL(loggerUrl)).toBe(true);
        });
    });
});
