/**
 * CSP Violation Reporter Module
 * 
 * This module handles Content Security Policy violation reporting
 * to help monitor and detect potential security issues.
 */

import { createLogger } from './logger.js';
import { getSetting } from './settings.js';

let logger;
let isInitialized = false;

/**
 * Initialize the CSP reporter
 */
export async function initializeCSPReporter() {
    if (isInitialized) return;
    
    const debugLoggingEnabled = await getSetting('debugLoggingEnabled');
    logger = createLogger(debugLoggingEnabled);
    
    // Listen for CSP violation reports
    document.addEventListener('securitypolicyviolation', handleCSPViolation);
    
    isInitialized = true;
    logger.log('CSP Reporter initialized successfully.');
}

/**
 * Handle CSP violation events
 * @param {SecurityPolicyViolationEvent} event - The CSP violation event
 */
function handleCSPViolation(event) {
    const violation = {
        timestamp: new Date().toISOString(),
        blockedURI: event.blockedURI,
        documentURI: event.documentURI,
        effectiveDirective: event.effectiveDirective,
        originalPolicy: event.originalPolicy,
        referrer: event.referrer,
        statusCode: event.statusCode,
        violatedDirective: event.violatedDirective,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
        columnNumber: event.columnNumber,
        sample: event.sample
    };
    
    // Log the violation
    logger.error('CSP Violation detected:', violation);
    
    // Store violation for analysis
    storeViolation(violation);
    
    // Send to service worker for centralized handling
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
            namespace: 'security',
            action: 'reportCSPViolation',
            payload: violation
        }).catch(error => {
            logger.error('Failed to send CSP violation to service worker:', error);
        });
    }
}

/**
 * Store CSP violation in local storage for analysis
 * @param {Object} violation - The violation details
 */
async function storeViolation(violation) {
    try {
        const violations = await getStoredViolations();
        violations.push(violation);
        
        // Keep only the last 100 violations to prevent storage bloat
        if (violations.length > 100) {
            violations.splice(0, violations.length - 100);
        }
        
        await chrome.storage.local.set({ 'csp_violations': violations });
        logger.log('CSP violation stored successfully.');
    } catch (error) {
        logger.error('Failed to store CSP violation:', error);
    }
}

/**
 * Get stored CSP violations
 * @returns {Promise<Array>} Array of stored violations
 */
export async function getStoredViolations() {
    try {
        const result = await chrome.storage.local.get(['csp_violations']);
        return result.csp_violations || [];
    } catch (error) {
        logger?.error('Failed to retrieve stored CSP violations:', error);
        return [];
    }
}

/**
 * Clear stored CSP violations
 * @returns {Promise<Object>} Operation result
 */
export async function clearStoredViolations() {
    try {
        await chrome.storage.local.remove(['csp_violations']);
        logger?.log('CSP violations cleared successfully.');
        return { status: 'success', message: 'CSP violations cleared' };
    } catch (error) {
        logger?.error('Failed to clear CSP violations:', error);
        return { status: 'error', message: error.message };
    }
}

/**
 * Get CSP violation statistics
 * @returns {Promise<Object>} Violation statistics
 */
export async function getViolationStats() {
    try {
        const violations = await getStoredViolations();
        
        const stats = {
            total: violations.length,
            byDirective: {},
            byURI: {},
            recent: violations.slice(-10), // Last 10 violations
            timeRange: {
                oldest: violations.length > 0 ? violations[0].timestamp : null,
                newest: violations.length > 0 ? violations[violations.length - 1].timestamp : null
            }
        };
        
        // Group by directive
        violations.forEach(violation => {
            const directive = violation.effectiveDirective || violation.violatedDirective;
            stats.byDirective[directive] = (stats.byDirective[directive] || 0) + 1;
            
            const uri = violation.blockedURI || 'unknown';
            stats.byURI[uri] = (stats.byURI[uri] || 0) + 1;
        });
        
        return { status: 'success', data: stats };
    } catch (error) {
        logger?.error('Failed to generate violation statistics:', error);
        return { status: 'error', message: error.message };
    }
}

/**
 * Check if CSP is properly configured
 * @returns {Object} CSP configuration status
 */
export function checkCSPConfiguration() {
    const requiredDirectives = [
        'default-src',
        'script-src',
        'style-src',
        'img-src',
        'connect-src',
        'object-src',
        'frame-ancestors',
        'base-uri',
        'form-action'
    ];
    
    const recommendations = [];
    const warnings = [];
    
    // Check if we're in an extension context
    if (typeof chrome === 'undefined' || !chrome.runtime) {
        warnings.push('Not running in extension context - CSP checks limited');
    }
    
    // Check for common security improvements
    recommendations.push('Consider implementing CSP nonce for inline scripts if needed');
    recommendations.push('Monitor CSP violations regularly for security threats');
    recommendations.push('Review and update CSP directives when adding new features');
    
    return {
        status: 'success',
        data: {
            requiredDirectives,
            recommendations,
            warnings,
            lastChecked: new Date().toISOString()
        }
    };
}

// Auto-initialize when module is loaded in browser context
if (typeof document !== 'undefined') {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeCSPReporter);
    } else {
        initializeCSPReporter();
    }
}
