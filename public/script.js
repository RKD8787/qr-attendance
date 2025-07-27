// Global Supabase client - to be initialized once
let supabaseClient = null;

// Global state
let allStudents = [];
let presentStudents = [];
let filteredStudents = [];

// ✅ MAIN ENTRY POINT
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 DOM Content Loaded. Initializing App...');
    const currentPage = window.location.pathname;

    // The login page is self-contained and doesn't need this script.
    // This check is a safeguard.
    if (currentPage.includes('login.html')) {
        return;
    }

    // For all other pages (index.html, student.html), start the main app flow.
    initializeApp();
});

/**
 * Initializes the Supabase client, checks authentication, and then starts the
 * page-specific logic. This is the main function that kicks everything off.
 */
async function initializeApp() {
    // 1. Initialize Supabase Client
    try {
        const SUPABASE_URL = 'https://zpesqzstorixfsmpntsx.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ';
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase client initialized successfully.');
    } catch (error) {
        console.error('❌ Supabase initialization error:', error);
        alert('FATAL: Could not connect to the database. The application cannot start.');
        return; // Stop execution if connection fails
    }

    // 2. Check Authentication
    const { data: { session } } = await supabaseClient.auth.getSession();
    const currentPage = window.location.pathname;

    // If on the main faculty page (index.html) and not logged in, redirect to login.
    if (!session && (currentPage.includes('index.html') || currentPage === '/')) {
        console.log('🚫 No active session. Redirecting to login.');
        window.location.href = 'login.html';
        return; // Stop execution
    }

    // 3. If authenticated (or on a public page like student.html), proceed to load data.
    console.log('✅ Session check complete. Fetching student data...');
    await fetchAllStudents();

    // 4. Start the correct UI
    if (currentPage.includes('student.html')) {
        initStudentView();
    } else {
        initFacultyView();
    }
}

// =================================================================
// DATA FETCHING FUNCTIONS
// =================================================================

async function fetchAllStudents() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('students').select('name, usn').order('name', { ascending: true });
        if (error) throw error;
        allStudents = data;
        filteredStudents = [...allStudents];
        console.log(`✅ Fetched ${allStudents.length} students.`);
    } catch (err) {
        console.error('❌ Error fetching master student list:', err);
        alert('Could not fetch the student list.');
    }
}

async function fetchAttendance() {
    if (!supabaseClient) return;
    try {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            console.warn('No session ID found. Cannot fetch attendance.');
            return;
        }

        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp')
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        presentStudents = data.map(record => record.student);
        updatePresentStudentsList(data);
        updatePresentCount();
    } catch (err) {
        console.error('❌ Error fetching attendance:', err);
    }
}

// =================================================================
// FACULTY VIEW FUNCTIONS (`index.html`)
// =================================================================

function initFacultyView() {
    console.log('🔄 Initializing Faculty View...');
    if (!localStorage.getItem('sessionId')) {
        localStorage.setItem('sessionId', Date.now().toString());
    }
    generateQR();
    fetchAttendance(); // Initial fetch
    setInterval(fetchAttendance, 5000); // Poll for updates
    updateStudentCount(); // For the modal
    setupFacultyStudentSearch(); // For the manual add modal
}

function generateQR() {
    const qrCodeContainer = document.getElementById('qr-code');
    if (!qrCodeContainer) return;

    qrCodeContainer.innerHTML = '';
    const sessionId = localStorage.getItem('sessionId');
    const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;

    if (typeof QRious === 'undefined') {
        qrCodeContainer.innerHTML = '<p style="color: red;">QR library failed to load.</p>';
        return;
    }

    const canvas = document.createElement('canvas');
    qrCodeContainer.appendChild(canvas);
    new QRious({ element: canvas, value: studentUrl, size: 340, padding: 18 });
    console.log('✅ QR code generated for session:', sessionId);
}

function updatePresentStudentsList(attendanceData) {
    const listElement = document.getElementById('present-students-list');
    if (!listElement) return;
    listElement.innerHTML = '';
    if (attendanceData.length === 0) {
        listElement.innerHTML = '<div class="student-item" style="opacity: 0.5; font-style: italic;">No students marked present yet</div>';
        return;
    }
    attendanceData.forEach(record => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';
        studentDiv.innerHTML = `
            <span>${record.student} <sub style="color: #666;">${record.usn || 'N/A'}</sub></span>
            <button class="remove-btn" onclick="removeStudent('${record.student}')">Remove</button>
        `;
        listElement.appendChild(studentDiv);
    });
}

function updatePresentCount() {
    const countElement = document.getElementById('present-count');
    if (countElement) {
        countElement.textContent = presentStudents.length;
    }
}

async function removeStudent(studentName) {
    if (!confirm(`Are you sure you want to remove ${studentName}?`)) return;
    try {
        const sessionId = localStorage.getItem('sessionId');
        await supabaseClient.from('attendance').delete().match({ student: studentName, session_id: sessionId });
        console.log(`✅ Removed ${studentName}`);
        fetchAttendance(); // Refresh list
    } catch (err) {
        console.error('❌ Error removing student:', err);
    }
}

async function startFreshAttendance() {
    if (!confirm("⚠️ This will clear ALL current attendance records and start a new session. This cannot be undone. Continue?")) return;
    try {
        // A .delete() with a filter is safer than a wide-open one.
        // We delete all records from the current session.
        const sessionId = localStorage.getItem('sessionId');
        const { error: deleteError } = await supabaseClient.from('attendance').delete().eq('session_id', sessionId);
        if (deleteError) throw deleteError;
        
        const newSessionId = Date.now().toString();
        localStorage.setItem('sessionId', newSessionId);
        
        presentStudents = [];
        updatePresentCount();
        updatePresentStudentsList([]);
        await generateQR();
        
        alert("✅ A new, fresh session has started.");
    } catch (err) {
        console.error("❌ Error starting fresh session:", err);
        alert("Failed to start a fresh session: " + err.message);
    }
}

// =================================================================
// STUDENT VIEW FUNCTIONS (`student.html`)
// =================================================================

function initStudentView() {
    console.log('🔄 Initializing Student View...');
    populateStudentList();
    setupStudentEventListeners();
    setupStudentSearch();
}

function populateStudentList(searchTerm = '') {
    const studentList = document.getElementById('student-list');
    if (!studentList) return;
    studentList.innerHTML = '';
    
    const studentsToDisplay = searchTerm
        ? allStudents.filter(s => s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm)))
        : allStudents;

    if (studentsToDisplay.length === 0) {
        studentList.innerHTML = '<div class="no-results"><p>No students found</p></div>';
        return;
    }
    studentsToDisplay.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';
        studentDiv.innerHTML = `
            <input type="radio" name="student" value="${student.name}" data-usn="${student.usn || ''}" id="student-${student.name}">
            <label for="student-${student.name}">${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></label>
        `;
        studentList.appendChild(studentDiv);
    });
    studentList.querySelectorAll('input[type="radio"]').forEach(radio => radio.addEventListener('change', updateStudentSelection));
}

function updateStudentSelection() {
    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) submitBtn.disabled = !document.querySelector('input[name="student"]:checked');

    document.querySelectorAll('.student-checkbox').forEach(box => {
        const radio = box.querySelector('input');
        box.classList.toggle('selected', radio.checked);
    });
}

function setupStudentEventListeners() {
    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) submitBtn.addEventListener('click', submitAttendance);

    const closeBtn = document.getElementById('close-success');
    if (closeBtn) closeBtn.addEventListener('click', () => window.close());
}

async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) return alert("Please select your name.");

    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    if (!sessionId) return alert("Invalid session. Please scan the QR code again.");

    const studentName = selectedRadio.value;
    const studentUSN = selectedRadio.getAttribute('data-usn') || null;
    
    const submitBtn = document.getElementById('submit-attendance');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const { error } = await supabaseClient.from('attendance').insert({
            student: studentName,
            usn: studentUSN,
            session_id: sessionId,
            device_id: 'student_device', // Simplified device ID
            timestamp: new Date().toISOString()
        });

        if (error) {
            // Error code for unique constraint violation (student already submitted)
            if (error.code === '23505') { 
                alert("You have already submitted your attendance for this session.");
            } else {
                throw error;
            }
        } else {
            document.getElementById('student-selection-page').style.display = 'none';
            document.getElementById('success-page').style.display = 'block';
        }
    } catch (err) {
        console.error("❌ Submission error:", err);
        alert("Failed to submit attendance: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
}

// =================================================================
// MODAL AND UTILITY FUNCTIONS
// =================================================================

function showStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'block';
    populateStudentListDisplay();
}

function closeStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'none';
}

function populateStudentListDisplay(searchTerm = '') {
    const display = document.getElementById('student-list-display');
    if (!display) return;
    display.innerHTML = '';

    const studentsToDisplay = searchTerm
        ? allStudents.filter(s => s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm)))
        : allStudents;

    if (studentsToDisplay.length === 0) {
        display.innerHTML = '<div class="no-students-message">No students found.</div>';
    } else {
        studentsToDisplay.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <span class="student-name">${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></span>
                <button class="delete-student-btn" onclick="deleteStudent('${student.name}')">🗑️ Delete</button>
            `;
            display.appendChild(item);
        });
    }
    updateStudentCount();
}

async function addNewStudent() {
    const nameInput = document.getElementById('new-student-name');
    const usnInput = document.getElementById('new-student-usn');
    const studentName = nameInput.value.trim();
    const studentUSN = usnInput.value.trim() || null;
    
    if (!studentName) return alert('Please enter a student name.');
    if (allStudents.some(s => s.name.toLowerCase() === studentName.toLowerCase())) return alert('A student with this name already exists.');

    try {
        await supabaseClient.from('students').insert({ name: studentName, usn: studentUSN });
        nameInput.value = '';
        usnInput.value = '';
        await fetchAllStudents();
        populateStudentListDisplay();
        alert(`${studentName} was added successfully!`);
    } catch (err) {
        alert('Failed to add student: ' + err.message);
    }
}

async function deleteStudent(studentName) {
    if (!confirm(`This will permanently delete ${studentName} from the master list. Continue?`)) return;
    try {
        await supabaseClient.from('students').delete().eq('name', studentName);
        await fetchAllStudents();
        populateStudentListDisplay();
        alert(`${studentName} was deleted.`);
    } catch (err) {
        alert('Failed to delete student: ' + err.message);
    }
}

function showAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'block';
    populateFacultyStudentDropdown();
}

function closeAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'none';
}

function setupFacultyStudentSearch() {
    const searchInput = document.getElementById('student-search-manual');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => populateFacultyStudentDropdown(e.target.value.toLowerCase().trim()));
    }
}

function populateFacultyStudentDropdown(searchTerm = '') {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    
    const unpresentStudents = allStudents.filter(s => 
        !presentStudents.includes(s.name) &&
        (searchTerm === '' || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm)))
    );

    if (unpresentStudents.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-item no-results">No available students found.</div>';
    } else {
        unpresentStudents.forEach(student => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerHTML = `${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub>`;
            item.onclick = () => addStudentManually(student.name, student.usn);
            dropdown.appendChild(item);
        });
    }
}

async function addStudentManually(studentName, studentUSN) {
    if (!studentName || presentStudents.includes(studentName)) return;
    try {
        const sessionId = localStorage.getItem('sessionId');
        await supabaseClient.from('attendance').insert({ 
            student: studentName, usn: studentUSN, session_id: sessionId, device_id: 'manual_admin'
        });
        fetchAttendance();
        closeAddManuallyModal();
    } catch (err) {
        alert('Failed to add student manually: ' + err.message);
    }
}

function updateStudentCount() {
    const countElement = document.getElementById('total-student-count');
    if(countElement) countElement.textContent = allStudents.length;
}

function setupStudentSearch() {
    const searchInput = document.getElementById('student-search');
    if (searchInput) searchInput.addEventListener('input', (e) => populateStudentList(e.target.value.toLowerCase().trim()));
}

async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        alert('Logout failed: ' + error.message);
    } else {
        localStorage.clear();
        window.location.href = 'login.html';
    }
}

function showPage(pageId) {
    // This function might not be needed anymore but is kept for now.
    console.log(`Showing page: ${pageId}`);
}
