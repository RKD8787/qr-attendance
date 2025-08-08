// ===== QR ATTENDANCE SYSTEM - FIXED SCRIPT.JS =====

// ===== CONFIGURATION =====
const CONFIG = {
    // Supabase configuration (load from environment in production)
    SUPABASE_URL: 'https://zpesqzstorixfsmpntsx.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ',
    
    // Cache settings
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    
    // Network settings
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    
    // UI settings
    TOAST_DURATION: 5000,
    LOADING_DELAY: 300,
    
    // QR Code settings
    QR_SIZE: 300,
    QR_ERROR_LEVEL: 'M',
    
    // WebAuthn settings
    WEBAUTHN_TIMEOUT: 60000, // 60 seconds
    RP_NAME: "QR Attendance System",
    
    // Validation rules
    VALIDATION: {
        USN_PATTERN: /^[A-Za-z0-9]{6,15}$/,
        NAME_PATTERN: /^[A-Za-z\s\-']{2,50}$/,
        SESSION_NAME_MIN_LENGTH: 3,
        SESSION_NAME_MAX_LENGTH: 100
    }
};

// ===== GLOBAL VARIABLES =====
let supabaseClient = null;
let currentUser = null;
let allStudents = [];
let presentStudents = [];
let currentSession = null;
let allSessions = [];
let allCourses = [];
let selectedStudentForAttendance = null;

// Performance and caching
let studentsCache = new Map();
let coursesCache = new Map();
let lastFetchTime = 0;

// Network and retry logic
let retryCount = 0;
let isOnline = navigator.onLine;

// Realtime subscriptions
let attendanceSubscription = null;
let studentSubscription = null;

// WebAuthn support detection
let webAuthnSupported = false;

// ===== WEBAUTHN MANAGER =====
const webAuthn = {
    async init() {
        try {
            // Check if WebAuthn is supported
            if (!window.PublicKeyCredential || !navigator.credentials || !navigator.credentials.create) {
                console.warn('WebAuthn not supported in this browser');
                webAuthnSupported = false;
                return;
            }

            // Check if platform authenticator is available
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            if (!available) {
                console.warn('Platform authenticator not available');
                webAuthnSupported = false;
                return;
            }

            webAuthnSupported = true;
            console.log('✅ WebAuthn support detected');
        } catch (error) {
            console.error('WebAuthn initialization failed:', error);
            webAuthnSupported = false;
        }
    },

    // Generate random challenge
    generateChallenge() {
        return crypto.getRandomValues(new Uint8Array(32));
    },

    // Convert string to Uint8Array
    stringToUint8Array(str) {
        return new TextEncoder().encode(str);
    },

    // Convert ArrayBuffer to base64url
    arrayBufferToBase64url(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    },

    // Convert base64url to ArrayBuffer
    base64urlToArrayBuffer(base64url) {
        const binary = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    },

    // Register a new credential for a student
    async registerCredential(studentUSN, studentName) {
        if (!webAuthnSupported) {
            throw new Error('WebAuthn not supported on this device');
        }

        try {
            const challenge = this.generateChallenge();
            
            const publicKeyCredentialCreationOptions = {
                challenge: challenge,
                rp: {
                    name: CONFIG.RP_NAME,
                    id: window.location.hostname
                },
                user: {
                    id: this.stringToUint8Array(studentUSN),
                    name: studentUSN,
                    displayName: studentName
                },
                pubKeyCredParams: [
                    { alg: -7, type: "public-key" }, // ES256
                    { alg: -257, type: "public-key" } // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    userVerification: "required",
                    requireResidentKey: false
                },
                timeout: CONFIG.WEBAUTHN_TIMEOUT,
                attestation: "direct"
            };

            console.log('🔐 Starting WebAuthn registration for:', studentUSN);
            
            const credential = await navigator.credentials.create({
                publicKey: publicKeyCredentialCreationOptions
            });

            if (!credential) {
                throw new Error('Failed to create credential');
            }

            // Store credential in database
            const credentialData = {
                student_usn: studentUSN,
                credential_id: this.arrayBufferToBase64url(credential.rawId),
                public_key: this.arrayBufferToBase64url(credential.response.publicKey),
                attestation_object: this.arrayBufferToBase64url(credential.response.attestationObject),
                client_data_json: this.arrayBufferToBase64url(credential.response.clientDataJSON),
                created_at: new Date().toISOString()
            };

            const { error } = await supabaseClient
                .from('webauthn_credentials')
                .insert([credentialData]);

            if (error) throw error;

            console.log('✅ WebAuthn credential registered successfully');
            return {
                success: true,
                credentialId: credentialData.credential_id
            };

        } catch (error) {
            console.error('❌ WebAuthn registration failed:', error);
            
            if (error.name === 'NotAllowedError') {
                throw new Error('Biometric verification was cancelled or failed');
            } else if (error.name === 'NotSupportedError') {
                throw new Error('This device does not support biometric authentication');
            } else if (error.name === 'InvalidStateError') {
                throw new Error('A credential already exists for this account');
            } else {
                throw new Error(`Biometric registration failed: ${error.message}`);
            }
        }
    },

    // Verify a credential for attendance
    async verifyCredential(studentUSN) {
        if (!webAuthnSupported) {
            throw new Error('WebAuthn not supported on this device');
        }

        try {
            // Get stored credential for this student
            const { data: credentialData, error } = await supabaseClient
                .from('webauthn_credentials')
                .select('credential_id, public_key')
                .eq('student_usn', studentUSN)
                .single();

            if (error || !credentialData) {
                throw new Error('No biometric credential found for this student. Please register first.');
            }

            const challenge = this.generateChallenge();
            
            const publicKeyCredentialRequestOptions = {
                challenge: challenge,
                allowCredentials: [{
                    type: "public-key",
                    id: this.base64urlToArrayBuffer(credentialData.credential_id),
                    transports: ["internal"]
                }],
                userVerification: "required",
                timeout: CONFIG.WEBAUTHN_TIMEOUT
            };

            console.log('🔐 Starting WebAuthn verification for:', studentUSN);

            const assertion = await navigator.credentials.get({
                publicKey: publicKeyCredentialRequestOptions
            });

            if (!assertion) {
                throw new Error('Failed to verify biometric');
            }

            console.log('✅ WebAuthn verification successful');
            
            return {
                success: true,
                verified: true,
                credentialId: this.arrayBufferToBase64url(assertion.rawId)
            };

        } catch (error) {
            console.error('❌ WebAuthn verification failed:', error);
            
            if (error.name === 'NotAllowedError') {
                throw new Error('Biometric verification was cancelled or failed');
            } else if (error.name === 'InvalidStateError') {
                throw new Error('No biometric credential found for this account');
            } else {
                throw new Error(`Biometric verification failed: ${error.message}`);
            }
        }
    },

    // Check if student has registered credential
    async hasCredential(studentUSN) {
        try {
            const { data, error } = await supabaseClient
                .from('webauthn_credentials')
                .select('id')
                .eq('student_usn', studentUSN)
                .single();

            return !error && !!data;
        } catch (error) {
            return false;
        }
    },

    // Delete credential for student
    async deleteCredential(studentUSN) {
        try {
            const { error } = await supabaseClient
                .from('webauthn_credentials')
                .delete()
                .eq('student_usn', studentUSN);

            if (error) throw error;
            
            console.log('✅ WebAuthn credential deleted for:', studentUSN);
            return true;
        } catch (error) {
            console.error('❌ Failed to delete WebAuthn credential:', error);
            return false;
        }
    }
};

// ===== UTILITY FUNCTIONS =====
const utils = {
    // Input validation and sanitization
    sanitizeText(input) {
        if (!input) return '';
        return String(input).replace(/[<>]/g, '').trim();
    },

    isValidUSN(usn) {
        return CONFIG.VALIDATION.USN_PATTERN.test(usn || '');
    },

    isValidName(name) {
        return CONFIG.VALIDATION.NAME_PATTERN.test(name || '');
    },

    isValidEmail(email) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailPattern.test(email || '');
    },

    isValidSessionName(sessionName) {
        const name = (sessionName || '').trim();
        return name.length >= CONFIG.VALIDATION.SESSION_NAME_MIN_LENGTH &&
               name.length <= CONFIG.VALIDATION.SESSION_NAME_MAX_LENGTH;
    },

    // Performance utilities
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Network utilities
    async executeWithRetry(operation, maxRetries = CONFIG.MAX_RETRIES) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`Attempt ${attempt} failed:`, error.message);
                
                if (attempt < maxRetries) {
                    const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1);
                    await this.sleep(delay);
                }
            }
        }
        
        throw lastError;
    },

    // Geolocation utilities
    async getCurrentPosition(options = {}) {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported'));
                return;
            }

            const defaultOptions = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000,
                ...options
            };

            navigator.geolocation.getCurrentPosition(resolve, reject, defaultOptions);
        });
    },

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    },

    // Date/time utilities
    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString();
    },

    getRelativeTime(timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    },

    // Export utilities
    downloadCSV(data, filename) {
        if (!window.Papa) {
            console.error('PapaParse library not loaded');
            return;
        }

        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    },

    // URL utilities
    getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    },

    generateStudentURL(sessionId) {
        const baseURL = window.location.origin;
        return `${baseURL}/student.html?session=${encodeURIComponent(sessionId)}`;
    }
};

// ===== UI MANAGEMENT =====
const ui = {
    // Toast notification system
    showToast(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
        const container = this.getToastContainer();
        const toast = this.createToast(message, type, duration);
        
        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto remove
        if (duration > 0) {
            setTimeout(() => {
                this.removeToast(toast);
            }, duration);
        }

        return toast;
    },

    getToastContainer() {
        let container = document.getElementById('toast-root');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-root';
            container.className = 'toast-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 2000;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }
        return container;
    },

    createToast(message, type, duration) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'polite');

        const icon = this.getToastIcon(type);
        
        toast.innerHTML = `
            <div class="toast-content" style="
                background: white;
                padding: 15px 20px;
                border-radius: 10px;
                box-shadow: 0 5px 25px rgba(0,0,0,0.2);
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 10px;
                border-left: 4px solid ${this.getToastColor(type)};
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
            ">
                <i class="${icon}" style="font-size: 1.2rem; color: ${this.getToastColor(type)};"></i>
                <span class="toast-message" style="flex: 1; color: #333;">${utils.sanitizeText(message)}</span>
                <button class="toast-close" aria-label="Close notification" style="
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #666;
                ">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${duration > 0 ? `<div class="toast-progress" style="
                height: 3px;
                background: ${this.getToastColor(type)};
                animation: toast-progress ${duration}ms linear;
            "></div>` : ''}
        `;

        // Add CSS animation
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                .toast.show .toast-content {
                    opacity: 1 !important;
                    transform: translateX(0) !important;
                }
                @keyframes toast-progress {
                    from { width: 100%; }
                    to { width: 0%; }
                }
            `;
            document.head.appendChild(style);
        }

        // Close button functionality
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(toast);
        });

        return toast;
    },

    getToastIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        return icons[type] || icons.info;
    },

    getToastColor(type) {
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        return colors[type] || colors.info;
    },

    removeToast(toast) {
        if (toast && toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }
    },

    // Modal system
    showModal(content, options = {}) {
        this.hideModal(); // Close any existing modal

        const modal = this.createModal(content, options);
        document.body.appendChild(modal);

        // Show modal
        requestAnimationFrame(() => {
            modal.style.display = 'flex';
            modal.style.opacity = '1';
        });

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        return modal;
    },

    createModal(content, options) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        
        modal.style.cssText = `
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.7);
            backdrop-filter: blur(8px);
            overflow-y: auto;
            opacity: 0;
            transition: opacity 0.3s ease;
            align-items: center;
            justify-content: center;
        `;

        modal.innerHTML = `
            <div class="modal-content" style="
                background: white;
                margin: 5vh auto;
                padding: 35px;
                border-radius: 20px;
                width: 90%;
                max-width: ${options.maxWidth || '700px'};
                box-shadow: 0 15px 50px rgba(0,0,0,0.15);
                position: relative;
                transform: translateY(-50px);
                transition: transform 0.3s ease;
            ">
                ${options.title ? `
                    <div class="modal-header" style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 30px;
                        border-bottom: 2px solid #e9ecef;
                        padding-bottom: 20px;
                    ">
                        <h3 style="color: #1e5aa8; font-size: 1.8rem; font-weight: 600; margin: 0;">
                            ${utils.sanitizeText(options.title)}
                        </h3>
                        <button class="close-btn" aria-label="Close modal" style="
                            background: none;
                            border: none;
                            font-size: 2.5rem;
                            cursor: pointer;
                            color: #666;
                            transition: all 0.3s ease;
                            padding: 5px;
                            border-radius: 50%;
                        ">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                ` : ''}
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        // Animate modal content
        setTimeout(() => {
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.transform = 'translateY(0)';
            }
        }, 50);

        // Close button functionality
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideModal());
        }

        // Click outside to close
        if (options.closeOnBackdrop !== false) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal();
                }
            });
        }

        return modal;
    },

    hideModal() {
        const existingModal = document.querySelector('.modal');
        if (existingModal) {
            existingModal.style.opacity = '0';
            setTimeout(() => {
                if (existingModal.parentNode) {
                    existingModal.parentNode.removeChild(existingModal);
                }
                // Restore body scroll
                document.body.style.overflow = '';
            }, 300);
        }
    }
};

// ===== AUTHENTICATION MANAGER =====
const auth = {
    async init() {
        try {
            if (!window.supabase) {
                throw new Error('Supabase library not loaded');
            }

            supabaseClient = window.supabase.createClient(
                CONFIG.SUPABASE_URL,
                CONFIG.SUPABASE_KEY
            );

            // Set up auth state listener
            supabaseClient.auth.onAuthStateChange((event, session) => {
                this.handleAuthStateChange(event, session);
            });

            // Check current session
            await this.checkSession();
            
        } catch (error) {
            console.error('Auth initialization failed:', error);
            ui.showToast('Failed to initialize authentication system', 'error');
        }
    },

    async checkSession() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            if (session) {
                currentUser = session.user;
                
                // Redirect to dashboard if on login page
                if (window.location.pathname.includes('login.html')) {
                    window.location.href = 'index.html';
                }
            } else {
                currentUser = null;
                
                // Redirect to login if on protected page
                if (!window.location.pathname.includes('login.html') && 
                    !window.location.pathname.includes('student.html')) {
                    window.location.href = 'login.html';
                }
            }
        } catch (error) {
            console.error('Session check failed:', error);
        }
    },

    handleAuthStateChange(event, session) {
        console.log('Auth state changed:', event);
        
        switch (event) {
            case 'SIGNED_IN':
                currentUser = session.user;
                ui.showToast('Login successful!', 'success');
                if (window.location.pathname.includes('login.html')) {
                    window.location.href = 'index.html';
                }
                break;
                
            case 'SIGNED_OUT':
                currentUser = null;
                ui.showToast('Logged out successfully', 'info');
                if (!window.location.pathname.includes('login.html')) {
                    window.location.href = 'login.html';
                }
                break;
        }
    },

    async login(email, password) {
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            return data;
            
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    },

    async logout() {
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
            
            // Clear any cached data
            localStorage.clear();
            studentsCache.clear();
            coursesCache.clear();
            
        } catch (error) {
            console.error('Logout failed:', error);
            ui.showToast('Logout failed. Please try again.', 'error');
        }
    },

    async requireAuth() {
        if (!currentUser) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }
};

// ===== DATA MANAGEMENT =====
const data = {
    async fetchAllStudents() {
        try {
            console.log('👥 Fetching students...');
            
            // Check cache first
            const now = Date.now();
            if (studentsCache.has('students') && (now - lastFetchTime) < CONFIG.CACHE_DURATION) {
                allStudents = studentsCache.get('students');
                console.log(`📋 Using cached students: ${allStudents.length}`);
                return allStudents;
            }

            const operation = async () => {
                const { data, error } = await supabaseClient
                    .from('students')
                    .select('name, usn')
                    .order('name', { ascending: true });
                
                if (error) throw error;
                return data || [];
            };

            const students = await utils.executeWithRetry(operation);
            allStudents = students;
            
            // Update cache
            studentsCache.set('students', students);
            lastFetchTime = now;
            
            console.log(`✅ Students fetched: ${students.length}`);
            return students;
            
        } catch (err) {
            console.error('❌ Error fetching students:', err);
            
            // Fall back to cached data if available
            if (studentsCache.has('students')) {
                allStudents = studentsCache.get('students');
                ui.showToast('Using cached student data', 'info');
            } else {
                allStudents = [];
                ui.showToast('Failed to load students', 'error');
            }
            return allStudents;
        }
    },

    async fetchAllCourses() {
        try {
            console.log('📚 Fetching courses...');
            
            // Check cache first
            if (coursesCache.has('courses')) {
                allCourses = coursesCache.get('courses');
                console.log(`📋 Using cached courses: ${allCourses.length}`);
                return allCourses;
            }

            const operation = async () => {
                const { data, error } = await supabaseClient
                    .from('courses')
                    .select('*')
                    .order('course_name', { ascending: true });
                
                if (error) throw error;
                return data || [];
            };

            allCourses = await utils.executeWithRetry(operation);
            
            // Update cache
            coursesCache.set('courses', allCourses);
            
            console.log(`✅ Courses fetched: ${allCourses.length}`);
            return allCourses;
            
        } catch (err) {
            console.error('❌ Error fetching courses:', err);
            allCourses = [];
            ui.showToast('Failed to load courses', 'error');
            return [];
        }
    },

    async fetchCurrentSessionAttendance() {
        if (!currentSession) {
            this.updatePresentStudentsList([]);
            return [];
        }

        try {
            console.log('📊 Fetching attendance for session:', currentSession.session_name);
            
            const operation = async () => {
                const { data, error } = await supabaseClient
                    .from('attendance')
                    .select('student, usn, timestamp, fingerprint_verified, location_verified')
                    .eq('session_id', currentSession.id)
                    .order('timestamp', { ascending: false });
                
                if (error) throw error;
                return data || [];
            };

            const attendanceData = await utils.executeWithRetry(operation);
            presentStudents = attendanceData.map(record => record.student);
            this.updatePresentStudentsList(attendanceData);
            
            console.log(`✅ Attendance data: ${attendanceData.length} records`);
            return attendanceData;
            
        } catch (err) {
            console.error('❌ Error fetching attendance:', err);
            if (isOnline) {
                ui.showToast('Failed to refresh attendance data', 'error');
            }
            return [];
        }
    },

    async fetchAllSessions(includeArchived = false) {
        try {
            console.log('📅 Fetching sessions...');
            
            const operation = async () => {
                let query = supabaseClient
                    .from('sessions')
                    .select(`
                        *,
                        courses(course_name, course_id)
                    `)
                    .order('created_at', { ascending: false });

                if (!includeArchived) {
                    query = query.eq('is_archived', false);
                }

                const { data, error } = await query;
                if (error) throw error;
                return data || [];
            };

            allSessions = await utils.executeWithRetry(operation);
            
            // Get attendance counts for each session
            await Promise.all(allSessions.map(async (session) => {
                try {
                    const { count, error } = await supabaseClient
                        .from('attendance')
                        .select('*', { count: 'exact', head: true })
                        .eq('session_id', session.id);
                    
                    if (!error) {
                        session.attendance_count = count || 0;
                    }
                } catch (err) {
                    console.warn(`Failed to get attendance count for session ${session.id}:`, err);
                    session.attendance_count = 0;
                }
            }));

            console.log(`✅ Sessions fetched: ${allSessions.length}`);
            return allSessions;
            
        } catch (err) {
            console.error('❌ Error fetching sessions:', err);
            allSessions = [];
            ui.showToast('Failed to load session history', 'error');
            return [];
        }
    },

    updatePresentStudentsList(attendanceData) {
        const listElement = document.getElementById('present-students-list');
        const countElement = document.getElementById('present-count');
        
        if (!listElement || !countElement) return;

        // Update count
        countElement.textContent = attendanceData.length.toString();

        // Clear and populate list
        listElement.innerHTML = '';
        
        if (attendanceData.length === 0) {
            listElement.innerHTML = '<li class="no-students-message">No students present yet</li>';
            return;
        }

        attendanceData.forEach(record => {
            const li = document.createElement('li');
            li.className = 'student-item';
            
            // Create verification badges
            let badges = '';
            if (record.fingerprint_verified) {
                badges += '<span class="badge fingerprint-badge">🔒 Biometric</span>';
            }
            if (record.location_verified) {
                badges += '<span class="badge location-badge">📍 Location</span>';
            }

            li.innerHTML = `
                <div class="student-info">
                    <div class="student-name">${utils.sanitizeText(record.student)}</div>
                    <div class="student-usn">${utils.sanitizeText(record.usn)}</div>
                    <div class="student-badges">${badges}</div>
                    <div class="attendance-time">${utils.getRelativeTime(record.timestamp)}</div>
                </div>
                <button class="remove-btn" onclick="removeStudentFromSession('${record.usn}')">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            listElement.appendChild(li);
        });
    }
};

// ===== SESSION MANAGEMENT =====
const sessions = {
    updateActiveSession(sessionData) {
        console.log('🔄 Updating active session:', sessionData?.session_name || 'None');
        currentSession = sessionData;
        
        const qrContainer = document.getElementById('qr-code-container');
        const sessionTitle = document.getElementById('current-session-title');
        
        if (sessionData) {
            // Save session to localStorage
            localStorage.setItem('sessionId', sessionData.id);
            
            // Update UI
            const courseName = sessionData.courses ? sessionData.courses.course_name : 'General';
            const courseId = sessionData.courses ? sessionData.courses.course_id : '';
            
            if (sessionTitle) {
                sessionTitle.textContent = `Active: ${sessionData.session_name} (${courseName} ${courseId})`;
            }
            
            // Generate QR code
            this.generateQR(sessionData.id);
            
            // Fetch current attendance
            data.fetchCurrentSessionAttendance();
            
        } else {
            // Clear session
            localStorage.removeItem('sessionId');
            
            if (sessionTitle) {
                sessionTitle.textContent = 'No Active Session';
            }
            
            if (qrContainer) {
                qrContainer.innerHTML = '<p class="qr-placeholder">Start a session to generate QR code</p>';
            }
            
            data.updatePresentStudentsList([]);
        }
    },

    generateQR(sessionId) {
        const qrContainer = document.getElementById('qr-code-container');
        if (!qrContainer) {
            console.error('❌ QR container not found');
            return;
        }

        try {
            // Clear container
            qrContainer.innerHTML = '';
            
            // Generate student URL
            const studentURL = utils.generateStudentURL(sessionId);
            
            // Create QR code using QRious library
            if (window.QRious) {
                const qr = new QRious({
                    element: document.createElement('canvas'),
                    value: studentURL,
                    size: CONFIG.QR_SIZE,
                    foreground: '#1e5aa8',
                    background: '#ffffff',
                    level: CONFIG.QR_ERROR_LEVEL
                });
                
                qrContainer.appendChild(qr.element);
                
                // Add URL display
                const urlDisplay = document.createElement('div');
                urlDisplay.className = 'qr-url-display';
                urlDisplay.innerHTML = `
                    <div style="margin-top: 15px; text-align: center;">
                        <small style="color: #666; display: block; margin-bottom: 5px;">Student URL:</small>
                        <input type="text" value="${studentURL}" readonly style="
                            width: 100%;
                            max-width: 300px;
                            padding: 8px;
                            border: 1px solid #ddd;
                            border-radius: 5px;
                            font-size: 0.85rem;
                            margin: 5px 0;
                            text-align: center;
                        ">
                        <br>
                        <button onclick="copyQRURL('${studentURL}')" style="
                            background: #1e5aa8;
                            color: white;
                            border: none;
                            padding: 8px 15px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 0.9rem;
                            margin-top: 5px;
                        ">
                            <i class="fas fa-copy"></i> Copy URL
                        </button>
                    </div>
                `;
                qrContainer.appendChild(urlDisplay);
                
                console.log('✅ QR code generated successfully');
                ui.showToast('QR code generated successfully', 'success');
                
            } else {
                console.error('❌ QRious library not loaded');
                qrContainer.innerHTML = '<p style="color: #dc3545;">QR Code library not loaded</p>';
            }
            
        } catch (error) {
            console.error('❌ QR generation failed:', error);
            qrContainer.innerHTML = '<p style="color: #dc3545;">Failed to generate QR code</p>';
        }
    },

    async restoreActiveSession() {
        try {
            const lastSessionId = localStorage.getItem('sessionId');
            if (lastSessionId && lastSessionId !== 'null') {
                console.log('🔄 Restoring session:', lastSessionId);
                
                const { data, error } = await supabaseClient
                    .from('sessions')
                    .select(`
                        *,
                        courses(course_name, course_id)
                    `)
                    .eq('id', lastSessionId)
                    .single();

                if (data && !error) {
                    console.log('✅ Session restored:', data.session_name);
                    this.updateActiveSession(data);
                    ui.showToast(`Session "${data.session_name}" restored`, 'success');
                } else {
                    console.log('⚠️ Session not found or expired');
                    this.updateActiveSession(null);
                    localStorage.removeItem('sessionId');
                }
            } else {
                this.updateActiveSession(null);
            }
        } catch (error) {
            console.error('❌ Error restoring session:', error);
            this.updateActiveSession(null);
            localStorage.removeItem('sessionId');
        }
    }
};

// ===== PAGE INITIALIZERS =====
const pages = {
    async initFacultyView() {
        try {
            console.log('📚 Initializing faculty view...');
            
            // Require authentication
            if (!(await auth.requireAuth())) return;
            
            // Initialize WebAuthn
            await webAuthn.init();
            
            // Load initial data
            await Promise.all([
                data.fetchAllStudents(),
                data.fetchAllCourses()
            ]);
            
            console.log(`📊 Data loaded: ${allStudents.length} students, ${allCourses.length} courses`);
            
            // Initialize UI components
            this.setupEventListeners();
            this.setupNetworkMonitoring();
            
            // Check for existing session
            await sessions.restoreActiveSession();
            
            // Setup real-time subscriptions
            this.setupRealtimeSubscriptions();
            
            console.log('✅ Faculty view initialized successfully');
            
        } catch (error) {
            console.error('❌ Faculty view initialization failed:', error);
            ui.showToast('Failed to initialize dashboard', 'error');
        }
    },

    async initStudentView() {
        try {
            console.log('🎓 Initializing student view...');
            
            // Initialize WebAuthn
            await webAuthn.init();
            
            const sessionId = utils.getQueryParam('session');
            if (!sessionId) {
                this.showErrorPage('No session ID provided. Please scan a valid QR code.');
                return;
            }

            await data.fetchAllStudents();
            await this.loadSessionForStudent(sessionId);
            this.setupStudentSearch();
            
            console.log('✅ Student view initialized successfully');
            
        } catch (error) {
            console.error('❌ Student view initialization failed:', error);
            this.showErrorPage('Failed to initialize student view.');
        }
    },

    async initLoginView() {
        console.log('🔐 Initializing login view...');
        
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                window.location.href = 'index.html';
                return;
            }

            this.setupLoginForm();
            
        } catch (error) {
            console.error('Login view initialization error:', error);
            ui.showToast('Failed to initialize login system', 'error');
        }
    },

    async loadSessionForStudent(sessionId) {
        try {
            const { data: sessionData, error } = await supabaseClient
                .from('sessions')
                .select(`
                    *,
                    courses(course_name, course_id)
                `)
                .eq('id', sessionId)
                .single();

            if (error) throw error;

            if (!sessionData) {
                this.showErrorPage('Session not found. Please scan a valid QR code.');
                return;
            }

            currentSession = sessionData;
            this.updateSessionDisplay(sessionData);
            this.populateStudentListForAttendance();
            
        } catch (err) {
            console.error('Error loading session:', err);
            this.showErrorPage('Failed to load session information.');
        }
    },

    updateSessionDisplay(sessionData) {
        const sessionTitle = document.getElementById('session-title');
        const sessionCourse = document.getElementById('session-course');
        
        if (sessionTitle) {
            sessionTitle.textContent = utils.sanitizeText(sessionData.session_name);
        }
        
        if (sessionCourse) {
            const courseName = sessionData.courses ? sessionData.courses.course_name : 'General Course';
            sessionCourse.textContent = utils.sanitizeText(courseName);
        }
    },

    populateStudentListForAttendance() {
        const studentsList = document.getElementById('students-list');
        const noStudentsMessage = document.getElementById('no-students-message');
        
        if (!studentsList) return;

        studentsList.innerHTML = '';
        
        if (allStudents.length === 0) {
            if (noStudentsMessage) {
                noStudentsMessage.style.display = 'block';
            }
            return;
        }

        if (noStudentsMessage) {
            noStudentsMessage.style.display = 'none';
        }

        allStudents.forEach(student => {
            const li = document.createElement('li');
            li.className = 'student-item';
            li.setAttribute('data-usn', student.usn);
            
            li.innerHTML = `
                <div class="student-info">
                    <div class="student-name">${utils.sanitizeText(student.name)}</div>
                    <div class="student-usn">${utils.sanitizeText(student.usn)}</div>
                </div>
            `;
            
            li.addEventListener('click', () => {
                // Remove previous selection
                document.querySelectorAll('.student-item').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Select current item
                li.classList.add('selected');
                selectedStudentForAttendance = student;
                
                // Show verification section if WebAuthn is supported
                this.showVerificationSection(student);
                
                // Enable submit button
                const submitBtn = document.getElementById('mark-attendance-btn');
                if (submitBtn) {
                    submitBtn.disabled = false;
                }
            });
            
            studentsList.appendChild(li);
        });
    },

    async showVerificationSection(student) {
        const verificationSection = document.getElementById('verification-section');
        if (!verificationSection) return;

        // Check if student has registered credential
        const hasCredential = await webAuthn.hasCredential(student.usn);
        
        let content = '<h4><i class="fas fa-shield-alt"></i> Security Verification</h4>';
        
        if (webAuthnSupported) {
            if (hasCredential) {
                content += `
                    <div class="verification-option">
                        <button class="verification-btn" id="verify-biometric-btn">
                            <i class="fas fa-fingerprint"></i>
                            Verify Biometric
                        </button>
                        <div class="verification-status" id="biometric-status"></div>
                    </div>
                `;
            } else {
                content += `
                    <div class="verification-option">
                        <button class="verification-btn" id="register-biometric-btn">
                            <i class="fas fa-fingerprint"></i>
                            Register Biometric
                        </button>
                        <div class="verification-status" id="biometric-status">
                            <small>First time? Register your biometric for secure attendance.</small>
                        </div>
                    </div>
                `;
            }
        } else {
            content += `
                <div class="verification-option">
                    <div class="verification-status" style="color: #666;">
                        <i class="fas fa-exclamation-triangle"></i>
                        Biometric verification not available on this device
                    </div>
                </div>
            `;
        }
        
        verificationSection.innerHTML = content;
        verificationSection.style.display = 'block';
        
        // Attach event listeners
        this.setupVerificationButtons(student);
    },

    setupVerificationButtons(student) {
        const registerBtn = document.getElementById('register-biometric-btn');
        const verifyBtn = document.getElementById('verify-biometric-btn');
        const biometricStatus = document.getElementById('biometric-status');
        
        if (registerBtn) {
            registerBtn.addEventListener('click', async () => {
                try {
                    registerBtn.disabled = true;
                    registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
                    
                    const result = await webAuthn.registerCredential(student.usn, student.name);
                    
                    if (result.success) {
                        biometricStatus.innerHTML = '<span style="color: #28a745;"><i class="fas fa-check"></i> Biometric registered successfully!</span>';
                        
                        // Replace register button with verify button
                        setTimeout(() => {
                            this.showVerificationSection(student);
                        }, 2000);
                    }
                    
                } catch (error) {
                    console.error('Biometric registration failed:', error);
                    biometricStatus.innerHTML = `<span style="color: #dc3545;"><i class="fas fa-exclamation-triangle"></i> ${error.message}</span>`;
                    registerBtn.disabled = false;
                    registerBtn.innerHTML = '<i class="fas fa-fingerprint"></i> Register Biometric';
                }
            });
        }
        
        if (verifyBtn) {
            verifyBtn.addEventListener('click', async () => {
                try {
                    verifyBtn.disabled = true;
                    verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
                    
                    const result = await webAuthn.verifyCredential(student.usn);
                    
                    if (result.success) {
                        biometricStatus.innerHTML = '<span style="color: #28a745;"><i class="fas fa-check"></i> Biometric verified!</span>';
                        
                        // Mark as biometrically verified
                        student.biometricVerified = true;
                        
                        // Update submit button to show verification
                        const submitBtn = document.getElementById('mark-attendance-btn');
                        if (submitBtn) {
                            submitBtn.innerHTML = '<i class="fas fa-check"></i> Mark Verified Attendance';
                            submitBtn.style.background = 'linear-gradient(135deg, #28a745, #1e7e34)';
                        }
                    }
                    
                } catch (error) {
                    console.error('Biometric verification failed:', error);
                    biometricStatus.innerHTML = `<span style="color: #dc3545;"><i class="fas fa-exclamation-triangle"></i> ${error.message}</span>`;
                } finally {
                    verifyBtn.disabled = false;
                    verifyBtn.innerHTML = '<i class="fas fa-fingerprint"></i> Verify Biometric';
                }
            });
        }
    },

    setupStudentSearch() {
        const searchInput = document.getElementById('student-search');
        if (!searchInput) return;

        const debouncedSearch = utils.debounce((searchTerm) => {
            this.filterStudentsList(searchTerm);
        }, 300);

        searchInput.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
        });
    },

    filterStudentsList(searchTerm) {
        const studentItems = document.querySelectorAll('.student-item');
        const term = searchTerm.toLowerCase().trim();

        studentItems.forEach(item => {
            const name = item.querySelector('.student-name').textContent.toLowerCase();
            const usn = item.querySelector('.student-usn').textContent.toLowerCase();
            
            if (name.includes(term) || usn.includes(term)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    },

    setupLoginForm() {
        const form = document.getElementById('login-form');
        const emailInput = document.getElementById('faculty-email');
        const passwordInput = document.getElementById('faculty-password');
        
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            // Validate inputs
            if (!email || !password) {
                ui.showToast('Please fill in all fields', 'error');
                return;
            }

            if (!utils.isValidEmail(email)) {
                ui.showToast('Please enter a valid email address', 'error');
                return;
            }

            try {
                // Show loading state
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

                await auth.login(email, password);
                
            } catch (error) {
                console.error('Login error:', error);
                
                let errorMessage = 'Invalid email or password';
                if (error.message?.includes('network')) {
                    errorMessage = 'Network error. Please check your connection.';
                }
                
                ui.showToast(errorMessage, 'error');
                
                // Reset button
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
            }
        });

        // Focus email input
        if (emailInput) {
            emailInput.focus();
        }
    },

    setupEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                auth.logout();
            });
        }

        // Start session button
        const startSessionBtn = document.getElementById('start-session-btn');
        if (startSessionBtn) {
            startSessionBtn.addEventListener('click', () => {
                this.showStartSessionModal();
            });
        }

        // Add manually button
        const addManuallyBtn = document.getElementById('add-manually-btn');
        if (addManuallyBtn) {
            addManuallyBtn.addEventListener('click', () => {
                this.showAddManuallyModal();
            });
        }

        // Manage students button
        const manageStudentsBtn = document.getElementById('manage-students-btn');
        if (manageStudentsBtn) {
            manageStudentsBtn.addEventListener('click', () => {
                this.showStudentsModal();
            });
        }

        // Session history button
        const sessionHistoryBtn = document.getElementById('session-history-btn');
        if (sessionHistoryBtn) {
            sessionHistoryBtn.addEventListener('click', () => {
                this.showSessionHistoryModal();
            });
        }

        // Export button
        const exportBtn = document.getElementById('export-attendance-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportAttendanceData();
            });
        }

        // Statistics button
        const statsBtn = document.getElementById('statistics-btn');
        if (statsBtn) {
            statsBtn.addEventListener('click', () => {
                this.showStatisticsModal();
            });
        }

        // Manage courses button
        const manageCoursesBtn = document.getElementById('manage-courses-btn');
        if (manageCoursesBtn) {
            manageCoursesBtn.addEventListener('click', () => {
                this.showCoursesModal();
            });
        }

        // Refresh data button
        const refreshDataBtn = document.getElementById('refresh-data-btn');
        if (refreshDataBtn) {
            refreshDataBtn.addEventListener('click', () => {
                this.refreshAllData();
            });
        }

        // Mark attendance button (student view)
        const markAttendanceBtn = document.getElementById('mark-attendance-btn');
        if (markAttendanceBtn) {
            markAttendanceBtn.addEventListener('click', () => {
                this.handleAttendanceSubmission();
            });
        }
    },

    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            isOnline = true;
            ui.showToast('Connection restored', 'success');
        });

        window.addEventListener('offline', () => {
            isOnline = false;
            ui.showToast('Connection lost. Some features may not work.', 'warning');
        });
    },

    setupRealtimeSubscriptions() {
        if (!currentSession) return;

        try {
            // Subscribe to attendance changes
            attendanceSubscription = supabaseClient
                .channel('attendance-changes')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'attendance',
                    filter: `session_id=eq.${currentSession.id}`
                }, () => {
                    data.fetchCurrentSessionAttendance();
                })
                .subscribe();

            console.log('✅ Real-time subscriptions set up');
            
        } catch (error) {
            console.error('❌ Failed to setup real-time subscriptions:', error);
        }
    },

    showStartSessionModal() {
        const modalContent = `
            <form id="start-session-form">
                <div class="form-group" style="margin-bottom: 20px;">
                    <label for="session-name" style="display: block; margin-bottom: 5px; font-weight: 600;">Session Name</label>
                    <input type="text" id="session-name" required maxlength="100" 
                           placeholder="e.g., Morning Lecture, Lab Session 1"
                           style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem;">
                </div>
                <div class="form-group" style="margin-bottom: 25px;">
                    <label for="course-select" style="display: block; margin-bottom: 5px; font-weight: 600;">Course (Optional)</label>
                    <select id="course-select" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem;">
                        <option value="">Select a course</option>
                        ${allCourses.map(course => 
                            `<option value="${course.id}">${utils.sanitizeText(course.course_name)} (${utils.sanitizeText(course.course_id)})</option>`
                        ).join('')}
                    </select>
                </div>
                <div style="display: flex; gap: 15px; justify-content: flex-end;">
                    <button type="button" onclick="ui.hideModal()" style="
                        padding: 12px 24px;
                        border: 2px solid #6c757d;
                        background: transparent;
                        color: #6c757d;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                    ">Cancel</button>
                    <button type="submit" style="
                        padding: 12px 24px;
                        background: #28a745;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                    ">Start Session</button>
                </div>
            </form>
        `;

        const modal = ui.showModal(modalContent, {
            title: '🚀 Start New Session',
            maxWidth: '500px'
        });

        const form = modal.querySelector('#start-session-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const sessionName = form['session-name'].value.trim();
            const courseId = form['course-select'].value || null;

            if (!utils.isValidSessionName(sessionName)) {
                ui.showToast('Session name must be between 3-100 characters', 'error');
                return;
            }

            try {
                const { data, error } = await supabaseClient
                    .from('sessions')
                    .insert([{
                        session_name: utils.sanitizeText(sessionName),
                        course_id: courseId,
                        is_archived: false,
                        created_at: new Date().toISOString()
                    }])
                    .select(`
                        *,
                        courses(course_name, course_id)
                    `)
                    .single();

                if (error) throw error;

                sessions.updateActiveSession(data);
                ui.hideModal();
                ui.showToast('Session started successfully!', 'success');

            } catch (error) {
                console.error('Failed to start session:', error);
                ui.showToast('Failed to start session. Please try again.', 'error');
            }
        });

        // Focus the session name input
        setTimeout(() => {
            const sessionNameInput = modal.querySelector('#session-name');
            if (sessionNameInput) {
                sessionNameInput.focus();
            }
        }, 100);
    },

    showAddManuallyModal() {
        if (!currentSession) {
            ui.showToast('Please start a session first', 'warning');
            return;
        }

        const modalContent = `
            <form id="manual-attendance-form">
                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 10px; font-weight: 600;">Select Student</label>
                    <div style="position: relative;">
                        <input type="text" id="student-search-manual" placeholder="Search by name or USN..." 
                               style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem;">
                        <div id="student-dropdown" style="
                            position: absolute;
                            top: 100%;
                            left: 0;
                            right: 0;
                            background: white;
                            border: 1px solid #ddd;
                            border-radius: 8px;
                            max-height: 200px;
                            overflow-y: auto;
                            z-index: 1000;
                            display: none;
                        "></div>
                    </div>
                    <input type="hidden" id="selected-student-usn">
                    <div id="selected-student-display" style="margin-top: 10px; display: none;">
                        <div style="padding: 10px; background: #e8f5e8; border-radius: 8px; border: 1px solid #28a745;">
                            <strong>Selected:</strong> <span id="selected-student-info"></span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 15px; justify-content: flex-end;">
                    <button type="button" onclick="ui.hideModal()" style="
                        padding: 12px 24px;
                        border: 2px solid #6c757d;
                        background: transparent;
                        color: #6c757d;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                    ">Cancel</button>
                    <button type="submit" id="add-manual-submit" disabled style="
                        padding: 12px 24px;
                        background: #28a745;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                        opacity: 0.5;
                    ">Add Attendance</button>
                </div>
            </form>
        `;

        const modal = ui.showModal(modalContent, {
            title: '➕ Add Manual Attendance',
            maxWidth: '500px'
        });

        this.setupManualAttendanceForm(modal);
    },

    setupManualAttendanceForm(modal) {
        const searchInput = modal.querySelector('#student-search-manual');
        const dropdown = modal.querySelector('#student-dropdown');
        const selectedUsnInput = modal.querySelector('#selected-student-usn');
        const selectedDisplay = modal.querySelector('#selected-student-display');
        const selectedInfo = modal.querySelector('#selected-student-info');
        const submitBtn = modal.querySelector('#add-manual-submit');
        const form = modal.querySelector('#manual-attendance-form');

        // Setup search with dropdown
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            
            if (term.length < 2) {
                dropdown.style.display = 'none';
                return;
            }

            const filteredStudents = allStudents.filter(student => 
                student.name.toLowerCase().includes(term) || 
                student.usn.toLowerCase().includes(term)
            ).slice(0, 10); // Limit to 10 results

            if (filteredStudents.length === 0) {
                dropdown.innerHTML = '<div style="padding: 10px; color: #666;">No students found</div>';
                dropdown.style.display = 'block';
                return;
            }

            dropdown.innerHTML = filteredStudents.map(student => `
                <div class="student-dropdown-item" data-usn="${student.usn}" style="
                    padding: 10px;
                    cursor: pointer;
                    border-bottom: 1px solid #eee;
                ">
                    <div style="font-weight: 600;">${utils.sanitizeText(student.name)}</div>
                    <div style="font-size: 0.9rem; color: #666;">${utils.sanitizeText(student.usn)}</div>
                </div>
            `).join('');
            dropdown.style.display = 'block';

            // Add click handlers for dropdown items
            dropdown.querySelectorAll('.student-dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    const usn = item.getAttribute('data-usn');
                    const student = allStudents.find(s => s.usn === usn);
                    
                    if (student) {
                        searchInput.value = student.name;
                        selectedUsnInput.value = student.usn;
                        selectedInfo.textContent = `${student.name} (${student.usn})`;
                        selectedDisplay.style.display = 'block';
                        dropdown.style.display = 'none';
                        
                        submitBtn.disabled = false;
                        submitBtn.style.opacity = '1';
                    }
                });

                // Hover effects
                item.addEventListener('mouseenter', () => {
                    item.style.background = '#f8f9fa';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.background = 'white';
                });
            });
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const selectedUsn = selectedUsnInput.value;
            if (!selectedUsn) {
                ui.showToast('Please select a student', 'error');
                return;
            }

            const student = allStudents.find(s => s.usn === selectedUsn);
            if (!student) {
                ui.showToast('Selected student not found', 'error');
                return;
            }

            try {
                // Check if attendance already exists
                const { data: existingAttendance } = await supabaseClient
                    .from('attendance')
                    .select('id')
                    .eq('session_id', currentSession.id)
                    .eq('usn', student.usn)
                    .single();

                if (existingAttendance) {
                    ui.showToast('Attendance already marked for this student', 'warning');
                    return;
                }

                // Add attendance
                const { error } = await supabaseClient
                    .from('attendance')
                    .insert([{
                        session_id: currentSession.id,
                        student: student.name,
                        usn: student.usn,
                        timestamp: new Date().toISOString(),
                        fingerprint_verified: false,
                        location_verified: false
                    }]);

                if (error) throw error;

                ui.showToast(`Attendance added for ${student.name}`, 'success');
                ui.hideModal();
                data.fetchCurrentSessionAttendance();

            } catch (error) {
                console.error('Failed to add manual attendance:', error);
                ui.showToast('Failed to add attendance. Please try again.', 'error');
            }
        });
    },

    showStudentsModal() {
        const modalContent = `
            <div class="add-student-section" style="margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <h4 style="margin-bottom: 15px;"><i class="fas fa-plus"></i> Add New Student</h4>
                <form id="add-student-form" style="display: flex; gap: 15px; align-items: end;">
                    <div style="flex: 1;">
                        <label for="student-name" style="display: block; margin-bottom: 5px; font-weight: 600;">Student Name</label>
                        <input type="text" id="student-name" required maxlength="50" 
                               placeholder="Enter full name"
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                    </div>
                    <div style="flex: 1;">
                        <label for="student-usn" style="display: block; margin-bottom: 5px; font-weight: 600;">USN</label>
                        <input type="text" id="student-usn" required maxlength="15" 
                               placeholder="e.g., 1AB21CS001"
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                    </div>
                    <div>
                        <button type="submit" style="
                            background: #28a745;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-weight: 600;
                        ">
                            <i class="fas fa-plus"></i> Add
                        </button>
                    </div>
                </form>
            </div>
            
            <div class="student-list-container">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div class="student-count-header" style="font-weight: 600; color: #1e5aa8;">
                        Total Students: ${allStudents.length}
                    </div>
                    <div style="position: relative;">
                        <input type="text" id="student-modal-search" placeholder="Search students..." 
                               style="padding: 8px 35px 8px 12px; border: 1px solid #ddd; border-radius: 20px; width: 250px;">
                        <i class="fas fa-search" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                    </div>
                </div>
                <div class="student-list-display" id="students-modal-list" style="max-height: 400px; overflow-y: auto;">
                    ${this.renderStudentsList()}
                </div>
            </div>
        `;

        const modal = ui.showModal(modalContent, {
            title: '👥 Manage Students',
            maxWidth: '900px'
        });

        // Setup add student form
        const addForm = modal.querySelector('#add-student-form');
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = addForm['student-name'].value.trim();
            const usn = addForm['student-usn'].value.trim().toUpperCase();

            // Validate inputs
            if (!utils.isValidName(name)) {
                ui.showToast('Please enter a valid name (2-50 characters, letters only)', 'error');
                return;
            }

            if (!utils.isValidUSN(usn)) {
                ui.showToast('Please enter a valid USN (6-15 characters, letters and numbers)', 'error');
                return;
            }

            // Check for duplicates
            if (allStudents.some(student => student.usn === usn)) {
                ui.showToast('A student with this USN already exists', 'error');
                return;
            }

            try {
                const { data, error } = await supabaseClient
                    .from('students')
                    .insert([{
                        name: utils.sanitizeText(name),
                        usn: utils.sanitizeText(usn)
                    }])
                    .select()
                    .single();

                if (error) throw error;

                // Update local data
                allStudents.push(data);
                allStudents.sort((a, b) => a.name.localeCompare(b.name));
                
                // Clear cache
                studentsCache.delete('students');
                
                // Reset form
                addForm.reset();
                
                // Update display
                const studentsList = modal.querySelector('#students-modal-list');
                studentsList.innerHTML = this.renderStudentsList();
                
                // Update count
                const countHeader = modal.querySelector('.student-count-header');
                countHeader.textContent = `Total Students: ${allStudents.length}`;

                ui.showToast('Student added successfully!', 'success');

            } catch (error) {
                console.error('Failed to add student:', error);
                ui.showToast('Failed to add student. Please try again.', 'error');
            }
        });

        // Setup search
        const searchInput = modal.querySelector('#student-modal-search');
        const debouncedSearch = utils.debounce((searchTerm) => {
            const studentsList = modal.querySelector('#students-modal-list');
            studentsList.innerHTML = this.renderStudentsList(searchTerm);
        }, 300);

        searchInput.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
        });
    },

    renderStudentsList(searchTerm = '') {
        let filteredStudents = allStudents;
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredStudents = allStudents.filter(student => 
                student.name.toLowerCase().includes(term) || 
                student.usn.toLowerCase().includes(term)
            );
        }

        if (filteredStudents.length === 0) {
            return `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>No students found</p>
                    ${searchTerm ? '<p>Try adjusting your search terms</p>' : ''}
                </div>
            `;
        }

        return filteredStudents.map(student => `
            <div class="student-item" data-usn="${student.usn}" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px;
                border-bottom: 1px solid #eee;
                hover: background-color: #f8f9fa;
            ">
                <div class="student-info">
                    <div style="font-weight: 600; font-size: 1.1rem;">${utils.sanitizeText(student.name)}</div>
                    <div style="color: #666; font-size: 0.9rem;">${utils.sanitizeText(student.usn)}</div>
                    ${webAuthnSupported ? `<div class="student-biometric-status" id="biometric-${student.usn}" style="font-size: 0.8rem; margin-top: 5px;">
                        <small><i class="fas fa-spinner fa-spin"></i> Checking biometric...</small>
                    </div>` : ''}
                </div>
                <div style="display: flex; gap: 10px;">
                    ${webAuthnSupported ? `<button onclick="manageBiometric('${student.usn}')" title="Manage biometric" style="
                        background: #17a2b8;
                        color: white;
                        border: none;
                        padding: 8px 12px;
                        border-radius: 5px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-fingerprint"></i>
                    </button>` : ''}
                    <button onclick="deleteStudent('${student.usn}')" title="Delete student" style="
                        background: #dc3545;
                        color: white;
                        border: none;
                        padding: 8px 12px;
                        border-radius: 5px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    showSessionHistoryModal() {
        const modalContent = `
            <div style="margin-bottom: 20px;">
                <button id="refresh-sessions-btn" style="
                    background: #17a2b8;
                    color: white;
                    border: none;
                    padding: 10px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </div>
            <div id="sessions-list" style="max-height: 500px; overflow-y: auto;">
                <div style="text-align: center; padding: 20px;">
                    <i class="fas fa-spinner fa-spin"></i> Loading sessions...
                </div>
            </div>
        `;

        const modal = ui.showModal(modalContent, {
            title: '📅 Session History',
            maxWidth: '800px'
        });

        this.loadSessionHistory(modal);

        // Setup refresh button
        const refreshBtn = modal.querySelector('#refresh-sessions-btn');
        refreshBtn.addEventListener('click', () => {
            this.loadSessionHistory(modal);
        });
    },

    async loadSessionHistory(modal) {
        const sessionsList = modal.querySelector('#sessions-list');
        sessionsList.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading sessions...</div>';

        try {
            const sessions = await data.fetchAllSessions();
            
            if (sessions.length === 0) {
                sessionsList.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i class="fas fa-calendar-times" style="font-size: 2rem; margin-bottom: 10px;"></i>
                        <p>No sessions found</p>
                    </div>
                `;
                return;
            }

            sessionsList.innerHTML = sessions.map(session => `
                <div class="session-item" style="
                    border: 1px solid #ddd;
                    border-radius: 10px;
                    padding: 15px;
                    margin-bottom: 15px;
                    background: ${session.id === currentSession?.id ? '#e8f5e8' : 'white'};
                ">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <h5 style="margin: 0 0 5px 0; color: #1e5aa8;">${utils.sanitizeText(session.session_name)}</h5>
                            <p style="margin: 0 0 5px 0; color: #666;">
                                Course: ${session.courses?.course_name || 'General'} 
                                ${session.courses?.course_id ? `(${session.courses.course_id})` : ''}
                            </p>
                            <p style="margin: 0; color: #666; font-size: 0.9rem;">
                                Created: ${utils.formatTimestamp(session.created_at)}
                            </p>
                            <p style="margin: 5px 0 0 0; color: #28a745; font-weight: 600;">
                                Attendance: ${session.attendance_count || 0} students
                            </p>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            ${session.id !== currentSession?.id ? `
                                <button onclick="activateSession('${session.id}')" title="Activate session" style="
                                    background: #28a745;
                                    color: white;
                                    border: none;
                                    padding: 8px 12px;
                                    border-radius: 5px;
                                    cursor: pointer;
                                ">
                                    <i class="fas fa-play"></i>
                                </button>
                            ` : `
                                <span style="
                                    background: #28a745;
                                    color: white;
                                    padding: 8px 12px;
                                    border-radius: 5px;
                                    font-size: 0.8rem;
                                    font-weight: 600;
                                ">ACTIVE</span>
                            `}
                            <button onclick="exportSessionData('${session.id}')" title="Export session data" style="
                                background: #17a2b8;
                                color: white;
                                border: none;
                                padding: 8px 12px;
                                border-radius: 5px;
                                cursor: pointer;
                            ">
                                <i class="fas fa-download"></i>
                            </button>
                            <button onclick="deleteSession('${session.id}')" title="Delete session" style="
                                background: #dc3545;
                                color: white;
                                border: none;
                                padding: 8px 12px;
                                border-radius: 5px;
                                cursor: pointer;
                            ">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Failed to load session history:', error);
            sessionsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #dc3545;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>Failed to load session history</p>
                </div>
            `;
        }
    },

    showCoursesModal() {
        const modalContent = `
            <div class="add-course-section" style="margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <h4 style="margin-bottom: 15px;"><i class="fas fa-plus"></i> Add New Course</h4>
                <form id="add-course-form" style="display: flex; gap: 15px; align-items: end;">
                    <div style="flex: 2;">
                        <label for="course-name" style="display: block; margin-bottom: 5px; font-weight: 600;">Course Name</label>
                        <input type="text" id="course-name" required maxlength="100" 
                               placeholder="e.g., Data Structures and Algorithms"
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                    </div>
                    <div style="flex: 1;">
                        <label for="course-id" style="display: block; margin-bottom: 5px; font-weight: 600;">Course ID</label>
                        <input type="text" id="course-id" required maxlength="20" 
                               placeholder="e.g., CS101"
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                    </div>
                    <div>
                        <button type="submit" style="
                            background: #28a745;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-weight: 600;
                        ">
                            <i class="fas fa-plus"></i> Add
                        </button>
                    </div>
                </form>
            </div>
            
            <div class="course-list-container">
                <div style="font-weight: 600; color: #1e5aa8; margin-bottom: 15px;">
                    Total Courses: ${allCourses.length}
                </div>
                <div id="courses-modal-list" style="max-height: 400px; overflow-y: auto;">
                    ${this.renderCoursesList()}
                </div>
            </div>
        `;

        const modal = ui.showModal(modalContent, {
            title: '📚 Manage Courses',
            maxWidth: '800px'
        });

        // Setup add course form
        const addForm = modal.querySelector('#add-course-form');
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const courseName = addForm['course-name'].value.trim();
            const courseId = addForm['course-id'].value.trim().toUpperCase();

            if (!courseName || !courseId) {
                ui.showToast('Please fill in all fields', 'error');
                return;
            }

            // Check for duplicates
            if (allCourses.some(course => course.course_id === courseId)) {
                ui.showToast('A course with this ID already exists', 'error');
                return;
            }

            try {
                const { data, error } = await supabaseClient
                    .from('courses')
                    .insert([{
                        course_name: utils.sanitizeText(courseName),
                        course_id: utils.sanitizeText(courseId)
                    }])
                    .select()
                    .single();

                if (error) throw error;

                // Update local data
                allCourses.push(data);
                allCourses.sort((a, b) => a.course_name.localeCompare(b.course_name));
                
                // Clear cache
                coursesCache.delete('courses');
                
                // Reset form
                addForm.reset();
                
                // Update display
                const coursesList = modal.querySelector('#courses-modal-list');
                coursesList.innerHTML = this.renderCoursesList();

                ui.showToast('Course added successfully!', 'success');

            } catch (error) {
                console.error('Failed to add course:', error);
                ui.showToast('Failed to add course. Please try again.', 'error');
            }
        });
    },

    renderCoursesList() {
        if (allCourses.length === 0) {
            return `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-book-open" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>No courses added yet</p>
                </div>
            `;
        }

        return allCourses.map(course => `
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px;
                border-bottom: 1px solid #eee;
            ">
                <div>
                    <div style="font-weight: 600; font-size: 1.1rem;">${utils.sanitizeText(course.course_name)}</div>
                    <div style="color: #666; font-size: 0.9rem;">${utils.sanitizeText(course.course_id)}</div>
                </div>
                <div>
                    <button onclick="deleteCourse('${course.id}')" title="Delete course" style="
                        background: #dc3545;
                        color: white;
                        border: none;
                        padding: 8px 12px;
                        border-radius: 5px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    async refreshAllData() {
        try {
            ui.showToast('Refreshing data...', 'info');
            
            // Clear caches
            studentsCache.clear();
            coursesCache.clear();
            
            // Refresh all data
            await Promise.all([
                data.fetchAllStudents(),
                data.fetchAllCourses(),
                data.fetchCurrentSessionAttendance()
            ]);
            
            ui.showToast('Data refreshed successfully!', 'success');
            
        } catch (error) {
            console.error('Failed to refresh data:', error);
            ui.showToast('Failed to refresh some data', 'warning');
        }
    },

    async exportAttendanceData() {
        if (!currentSession) {
            ui.showToast('No active session to export', 'warning');
            return;
        }

        try {
            const attendanceData = await data.fetchCurrentSessionAttendance();
            
            if (attendanceData.length === 0) {
                ui.showToast('No attendance data to export', 'info');
                return;
            }

            const exportData = attendanceData.map(record => ({
                'Student Name': record.student || 'N/A',
                'USN': record.usn || 'N/A',
                'Session': currentSession.session_name || 'N/A',
                'Course': currentSession.courses?.course_name || 'N/A',
                'Course ID': currentSession.courses?.course_id || 'N/A',
                'Timestamp': utils.formatTimestamp(record.timestamp),
                'Location Verified': record.location_verified ? 'Yes' : 'No',
                'Biometric Verified': record.fingerprint_verified ? 'Yes' : 'No'
            }));

            const filename = `attendance_${currentSession.session_name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
            
            utils.downloadCSV(exportData, filename);
            ui.showToast('Attendance data exported successfully!', 'success');

        } catch (error) {
            console.error('Export failed:', error);
            ui.showToast('Failed to export attendance data', 'error');
        }
    },

    showStatisticsModal() {
        const modalContent = `
            <div class="stats-container">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 15px; text-align: center;">
                        <h4 style="margin: 0 0 10px 0;">Total Students</h4>
                        <p style="margin: 0; font-size: 2rem; font-weight: bold;">${allStudents.length}</p>
                    </div>
                    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 15px; text-align: center;">
                        <h4 style="margin: 0 0 10px 0;">Present Today</h4>
                        <p style="margin: 0; font-size: 2rem; font-weight: bold;">${presentStudents.length}</p>
                    </div>
                    <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 15px; text-align: center;">
                        <h4 style="margin: 0 0 10px 0;">Attendance Rate</h4>
                        <p style="margin: 0; font-size: 2rem; font-weight: bold;">${allStudents.length > 0 ? Math.round((presentStudents.length / allStudents.length) * 100) : 0}%</p>
                    </div>
                    <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 15px; text-align: center;">
                        <h4 style="margin: 0 0 10px 0;">Total Courses</h4>
                        <p style="margin: 0; font-size: 2rem; font-weight: bold;">${allCourses.length}</p>
                    </div>
                </div>
                ${currentSession ? `
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 15px; border-left: 5px solid #28a745;">
                        <h4 style="margin: 0 0 15px 0; color: #1e5aa8;"><i class="fas fa-play-circle"></i> Current Session</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                            <div>
                                <strong>Session Name:</strong><br>
                                <span>${utils.sanitizeText(currentSession.session_name)}</span>
                            </div>
                            <div>
                                <strong>Course:</strong><br>
                                <span>${currentSession.courses?.course_name || 'General'}</span>
                            </div>
                            <div>
                                <strong>Started:</strong><br>
                                <span>${utils.formatTimestamp(currentSession.created_at)}</span>
                            </div>
                            <div>
                                <strong>Students Present:</strong><br>
                                <span>${presentStudents.length}</span>
                            </div>
                        </div>
                        ${webAuthnSupported ? `
                            <div style="margin-top: 15px; padding: 10px; background: #e8f5e8; border-radius: 8px;">
                                <i class="fas fa-fingerprint" style="color: #28a745;"></i>
                                <strong style="color: #28a745;">WebAuthn Support:</strong> Biometric authentication available
                            </div>
                        ` : `
                            <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 8px;">
                                <i class="fas fa-exclamation-triangle" style="color: #856404;"></i>
                                <strong style="color: #856404;">WebAuthn:</strong> Biometric authentication not available on this device
                            </div>
                        `}
                    </div>
                ` : `
                    <div style="background: #fff3cd; padding: 20px; border-radius: 15px; border-left: 5px solid #ffc107; text-align: center;">
                        <h4 style="color: #856404; margin: 0 0 10px 0;"><i class="fas fa-pause-circle"></i> No Active Session</h4>
                        <p style="color: #856404; margin: 0;">Start a new session to begin taking attendance</p>
                    </div>
                `}
            </div>
        `;

        ui.showModal(modalContent, {
            title: '📊 Statistics Dashboard',
            maxWidth: '900px'
        });
    },

    async handleAttendanceSubmission() {
        if (!selectedStudentForAttendance) {
            ui.showToast('Please select your name first', 'warning');
            return;
        }

        if (!currentSession) {
            ui.showToast('Session not found. Please scan the QR code again.', 'error');
            return;
        }

        try {
            // Show loading state
            const submitBtn = document.getElementById('mark-attendance-btn');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marking Attendance...';

            // Check if attendance already marked
            const { data: existingAttendance } = await supabaseClient
                .from('attendance')
                .select('id')
                .eq('session_id', currentSession.id)
                .eq('usn', selectedStudentForAttendance.usn)
                .single();

            if (existingAttendance) {
                ui.showToast('Attendance already marked for this session', 'warning');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
                return;
            }

            // Mark attendance
            const { error } = await supabaseClient
                .from('attendance')
                .insert([{
                    session_id: currentSession.id,
                    student: selectedStudentForAttendance.name,
                    usn: selectedStudentForAttendance.usn,
                    timestamp: new Date().toISOString(),
                    fingerprint_verified: selectedStudentForAttendance.biometricVerified || false,
                    location_verified: false // Can be enhanced with geolocation verification
                }]);

            if (error) throw error;

            // Show success message
            this.showAttendanceSuccess();

        } catch (error) {
            console.error('Failed to mark attendance:', error);
            ui.showToast('Failed to mark attendance. Please try again.', 'error');
            
            // Reset button
            const submitBtn = document.getElementById('mark-attendance-btn');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check"></i> Mark Attendance';
        }
    },

    showAttendanceSuccess() {
        // Hide selection section
        const selectionSection = document.getElementById('student-selection-section');
        if (selectionSection) {
            selectionSection.style.display = 'none';
        }

        // Show success message
        const successMessage = document.getElementById('attendance-success');
        if (successMessage) {
            successMessage.style.display = 'block';
            
            // Add attendance details
            const detailsDiv = successMessage.querySelector('#attendance-details');
            if (detailsDiv && selectedStudentForAttendance) {
                let verificationStatus = '';
                if (selectedStudentForAttendance.biometricVerified) {
                    verificationStatus = '<p style="color: #28a745;"><strong>✅ Biometric Verified</strong></p>';
                }
                
                detailsDiv.innerHTML = `
                    <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; border: 2px solid #28a745;">
                        <h4 style="color: #28a745; margin: 0 0 15px 0;"><i class="fas fa-check-circle"></i> Attendance Marked Successfully!</h4>
                        <p><strong>Student:</strong> ${utils.sanitizeText(selectedStudentForAttendance.name)}</p>
                        <p><strong>USN:</strong> ${utils.sanitizeText(selectedStudentForAttendance.usn)}</p>
                        <p><strong>Session:</strong> ${utils.sanitizeText(currentSession.session_name)}</p>
                        <p><strong>Time:</strong> ${utils.formatTimestamp(new Date())}</p>
                        ${verificationStatus}
                        <div style="margin-top: 15px; text-align: center;">
                            <button onclick="window.close()" style="
                                background: #28a745;
                                color: white;
                                border: none;
                                padding: 12px 24px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-weight: 600;
                                font-size: 1rem;
                            ">
                                <i class="fas fa-times"></i> Close Window
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    },

    showErrorPage(message) {
        document.body.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                font-family: 'Segoe UI', sans-serif;
                color: white;
                text-align: center;
                padding: 20px;
            ">
                <div style="
                    background: rgba(255,255,255,0.1);
                    padding: 40px;
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.2);
                    max-width: 500px;
                ">
                    <i class="fas fa-exclamation-triangle" style="font-size: 4rem; margin-bottom: 20px; color: #ffc107;"></i>
                    <h2 style="margin-bottom: 20px;">Oops! Something went wrong</h2>
                    <p style="margin-bottom: 30px; font-size: 1.1rem;">${utils.sanitizeText(message)}</p>
                    <button onclick="window.location.reload()" style="
                        background: #28a745;
                        color: white;
                        border: none;
                        padding: 15px 30px;
                        border-radius: 10px;
                        cursor: pointer;
                        font-size: 1.1rem;
                        font-weight: 600;
                    ">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                </div>
            </div>
        `;
    }
};

// ===== GLOBAL HELPER FUNCTIONS =====
window.copyQRURL = function(url) {
    navigator.clipboard.writeText(url).then(() => {
        ui.showToast('URL copied to clipboard!', 'success');
    }).catch(() => {
        ui.showToast('Failed to copy URL', 'error');
    });
};

window.removeStudentFromSession = async function(usn) {
    if (!currentSession) return;
    
    if (!confirm('Remove this student from the current session?')) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('attendance')
            .delete()
            .eq('session_id', currentSession.id)
            .eq('usn', usn);

        if (error) throw error;

        ui.showToast('Student removed from session', 'success');
        data.fetchCurrentSessionAttendance();

    } catch (error) {
        console.error('Failed to remove student:', error);
        ui.showToast('Failed to remove student', 'error');
    }
};

window.deleteStudent = async function(usn) {
    if (!confirm('Are you sure you want to delete this student? This will also remove their biometric data.')) {
        return;
    }

    try {
        // Delete WebAuthn credential first
        await webAuthn.deleteCredential(usn);
        
        // Delete student record
        const { error } = await supabaseClient
            .from('students')
            .delete()
            .eq('usn', usn);

        if (error) throw error;

        // Update local data
        allStudents = allStudents.filter(student => student.usn !== usn);
        studentsCache.delete('students');

        ui.showToast('Student deleted successfully', 'success');
        
        // Refresh students modal if open
        const modal = document.querySelector('.modal');
        if (modal) {
            const studentsList = modal.querySelector('#students-modal-list');
            if (studentsList) {
                studentsList.innerHTML = pages.renderStudentsList();
                const countHeader = modal.querySelector('.student-count-header');
                if (countHeader) {
                    countHeader.textContent = `Total Students: ${allStudents.length}`;
                }
            }
        }

    } catch (error) {
        console.error('Failed to delete student:', error);
        ui.showToast('Failed to delete student', 'error');
    }
};

window.manageBiometric = async function(usn) {
    const student = allStudents.find(s => s.usn === usn);
    if (!student) return;

    try {
        const hasCredential = await webAuthn.hasCredential(usn);
        
        if (hasCredential) {
            // Show options to test or delete
            const action = confirm('Student has biometric registered. Click OK to delete registration, or Cancel to test verification.');
            
            if (action) {
                // Delete credential
                const success = await webAuthn.deleteCredential(usn);
                if (success) {
                    ui.showToast(`Biometric credential deleted for ${student.name}`, 'success');
                    // Update status in modal
                    const statusElement = document.getElementById(`biometric-${usn}`);
                    if (statusElement) {
                        statusElement.innerHTML = '<small style="color: #dc3545;">No biometric registered</small>';
                    }
                } else {
                    ui.showToast('Failed to delete biometric credential', 'error');
                }
            } else {
                // Test verification
                try {
                    const result = await webAuthn.verifyCredential(usn);
                    if (result.success) {
                        ui.showToast(`Biometric verification successful for ${student.name}`, 'success');
                    }
                } catch (error) {
                    ui.showToast(`Biometric verification failed: ${error.message}`, 'error');
                }
            }
        } else {
            // Register new credential
            try {
                const result = await webAuthn.registerCredential(usn, student.name);
                if (result.success) {
                    ui.showToast(`Biometric registered successfully for ${student.name}`, 'success');
                    // Update status in modal
                    const statusElement = document.getElementById(`biometric-${usn}`);
                    if (statusElement) {
                        statusElement.innerHTML = '<small style="color: #28a745;">✓ Biometric registered</small>';
                    }
                }
            } catch (error) {
                ui.showToast(`Biometric registration failed: ${error.message}`, 'error');
            }
        }
    } catch (error) {
        console.error('Biometric management error:', error);
        ui.showToast('Failed to manage biometric credential', 'error');
    }
};

window.activateSession = async function(sessionId) {
    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .select(`
                *,
                courses(course_name, course_id)
            `)
            .eq('id', sessionId)
            .single();

        if (error) throw error;

        sessions.updateActiveSession(data);
        ui.hideModal();
        ui.showToast(`Session "${data.session_name}" activated`, 'success');

    } catch (error) {
        console.error('Failed to activate session:', error);
        ui.showToast('Failed to activate session', 'error');
    }
};

window.exportSessionData = async function(sessionId) {
    try {
        // Get session details
        const { data: sessionData, error: sessionError } = await supabaseClient
            .from('sessions')
            .select(`
                *,
                courses(course_name, course_id)
            `)
            .eq('id', sessionId)
            .single();

        if (sessionError) throw sessionError;

        // Get attendance data
        const { data: attendanceData, error: attendanceError } = await supabaseClient
            .from('attendance')
            .select('*')
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: true });

        if (attendanceError) throw attendanceError;

        if (!attendanceData || attendanceData.length === 0) {
            ui.showToast('No attendance data found for this session', 'info');
            return;
        }

        const exportData = attendanceData.map(record => ({
            'Student Name': record.student || 'N/A',
            'USN': record.usn || 'N/A',
            'Session': sessionData.session_name || 'N/A',
            'Course': sessionData.courses?.course_name || 'N/A',
            'Course ID': sessionData.courses?.course_id || 'N/A',
            'Date': utils.formatTimestamp(record.timestamp).split(',')[0],
            'Time': utils.formatTimestamp(record.timestamp).split(',')[1]?.trim() || '',
            'Location Verified': record.location_verified ? 'Yes' : 'No',
            'Biometric Verified': record.fingerprint_verified ? 'Yes' : 'No'
        }));

        const filename = `session_${sessionData.session_name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        
        utils.downloadCSV(exportData, filename);
        ui.showToast('Session data exported successfully!', 'success');

    } catch (error) {
        console.error('Export failed:', error);
        ui.showToast('Failed to export session data', 'error');
    }
};

window.deleteSession = async function(sessionId) {
    if (!confirm('Are you sure you want to delete this session? This will also delete all attendance records for this session.')) {
        return;
    }

    try {
        // Delete attendance records first
        const { error: attendanceError } = await supabaseClient
            .from('attendance')
            .delete()
            .eq('session_id', sessionId);

        if (attendanceError) throw attendanceError;

        // Delete session
        const { error: sessionError } = await supabaseClient
            .from('sessions')
            .delete()
            .eq('id', sessionId);

        if (sessionError) throw sessionError;

        // Clear current session if it was the deleted one
        if (currentSession && currentSession.id === sessionId) {
            sessions.updateActiveSession(null);
        }

        ui.showToast('Session deleted successfully', 'success');
        
        // Refresh session history modal if open
        const modal = document.querySelector('.modal');
        if (modal && modal.querySelector('#sessions-list')) {
            pages.loadSessionHistory(modal);
        }

    } catch (error) {
        console.error('Failed to delete session:', error);
        ui.showToast('Failed to delete session', 'error');
    }
};

window.deleteCourse = async function(courseId) {
    if (!confirm('Are you sure you want to delete this course?')) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('courses')
            .delete()
            .eq('id', courseId);

        if (error) throw error;

        // Update local data
        allCourses = allCourses.filter(course => course.id !== courseId);
        coursesCache.delete('courses');

        ui.showToast('Course deleted successfully', 'success');
        
        // Refresh courses modal if open
        const modal = document.querySelector('.modal');
        if (modal) {
            const coursesList = modal.querySelector('#courses-modal-list');
            if (coursesList) {
                coursesList.innerHTML = pages.renderCoursesList();
            }
        }

    } catch (error) {
        console.error('Failed to delete course:', error);
        ui.showToast('Failed to delete course', 'error');
    }
};

// ===== MAIN INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing QR Attendance System...');
    
    try {
        // Initialize authentication
        await auth.init();
        
        // Determine which page we're on and initialize accordingly
        const currentPath = window.location.pathname;
        
        if (currentPath.includes('student.html')) {
            await pages.initStudentView();
        } else if (currentPath.includes('login.html')) {
            await pages.initLoginView();
        } else {
            // Default to faculty view (index.html)
            await pages.initFacultyView();
        }
        
        console.log('✅ Application initialized successfully');
        
    } catch (error) {
        console.error('❌ Fatal initialization error:', error);
        ui.showToast('Failed to initialize application. Please refresh the page.', 'error');
    }
});

// ===== CLEANUP ON PAGE UNLOAD =====
window.addEventListener('beforeunload', () => {
    // Clean up real-time subscriptions
    if (attendanceSubscription) {
        attendanceSubscription.unsubscribe();
    }
    if (studentSubscription) {
        studentSubscription.unsubscribe();
    }
    
    console.log('🧹 Cleaned up subscriptions');
});

// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { utils, auth, data, sessions, pages, ui, webAuthn };
}
