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

    if (currentPage.includes('login.html')) {
        return;
    }

    initializeApp();
});

/**
 * Initializes the Supabase client, checks authentication, and then starts the
 * page-specific logic.
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
        return;
    }

    // 2. Check Authentication
    const { data: { session } } = await supabaseClient.auth.getSession();
    const currentPage = window.location.pathname;

    if (!session && (currentPage.includes('index.html') || currentPage === '/')) {
        console.log('🚫 No active session. Redirecting to login.');
        window.location.href = 'login.html';
        return;
    }

    // 3. Load data
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
    } catch (err) {
        console.error('❌ Error fetching master student list:', err);
    }
}

async function fetchAttendance() {
    if (!supabaseClient) return;
    try {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) return;

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
    fetchAttendance();
    setInterval(fetchAttendance, 5000);
    updateStudentCount();
    setupFacultyStudentSearch();
    // ✅ SETUP THE SEARCH FOR THE "MANAGE STUDENT LIST" MODAL
    setupStudentListSearch();
}

function generateQR() {
    const qrCodeContainer = document.getElementById('qr-code');
    if (!qrCodeContainer) return;
    qrCodeContainer.innerHTML = '';
    const sessionId = localStorage.getItem('sessionId');
    const studentUrl = `${window.location.origin}/public/student.html?session=${sessionId}`;
    new QRious({ element: qrCodeContainer.appendChild(document.createElement('canvas')), value: studentUrl, size: 350, padding: 10 });
    console.log('✅ QR code generated');
}

function updatePresentStudentsList(attendanceData) {
    const listElement = document.getElementById('present-students-list');
    if (!listElement) return;
    listElement.innerHTML = '';
    if (attendanceData.length === 0) {
        listElement.innerHTML = '<div class="student-item" style="opacity: 0.5; font-style: italic;">No students present</div>';
        return;
    }
    attendanceData.forEach(record => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';
        studentDiv.innerHTML = `<span>${record.student} <sub style="color: #666;">${record.usn || 'N/A'}</sub></span><button class="remove-btn" onclick="removeStudent('${record.student}')">Remove</button>`;
        listElement.appendChild(studentDiv);
    });
}

function updatePresentCount() {
    const countElement = document.getElementById('present-count');
    if (countElement) countElement.textContent = presentStudents.length;
}

async function removeStudent(studentName) {
    if (!confirm(`Remove ${studentName} from this session?`)) return;
    try {
        const sessionId = localStorage.getItem('sessionId');
        await supabaseClient.from('attendance').delete().match({ student: studentName, session_id: sessionId });
        fetchAttendance();
    } catch (err) {
        console.error('❌ Error removing student:', err);
    }
}

// =================================================================
// ... keep all the code above this line the same ...
// =================================================================

async function startFreshAttendance() {
    // 1. Prompt the faculty to name the new session
    const sessionName = prompt("Please enter a name for this new session (e.g., 'Monday Class - Section A'):");
    if (!sessionName || sessionName.trim() === '') {
        alert("Session creation cancelled. A name is required.");
        return;
    }

    try {
        // 2. Create a new record in the `sessions` table
        const { data, error } = await supabaseClient
            .from('sessions')
            .insert({ session_name: sessionName })
            .select('id') // Important: select the ID of the new row
            .single(); // We expect only one row back

        if (error) throw error;
        
        const newSessionId = data.id; // The ID from our new sessions table
        
        // 3. Update localStorage with the new session ID
        localStorage.setItem('sessionId', newSessionId);
        
        // 4. Reset the UI for the new session
        presentStudents = [];
        updatePresentCount();
        updatePresentStudentsList([]); // Clears the list on the screen
        await generateQR(); // Generate the new QR code
        
        alert(`✅ New session "${sessionName}" has started successfully!`);

    } catch (err) {
        console.error("❌ Error starting new session:", err);
        alert("Failed to create a new session: " + err.message);
    }
}

// =================================================================
// ... keep all the code below this line the same ...
// =================================================================

// =================================================================
// STUDENT VIEW FUNCTIONS (`student.html`)
// =================================================================

function initStudentView() {
    console.log('🔄 Initializing Student View...');
    populateStudentListForSelection();
    setupStudentEventListeners();
    setupStudentSearchForSelection();
}

function populateStudentListForSelection(searchTerm = '') {
    const studentList = document.getElementById('student-list');
    if (!studentList) return;
    studentList.innerHTML = '';
    
    const studentsToDisplay = allStudents.filter(s => searchTerm === '' || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm)));

    if (studentsToDisplay.length === 0) {
        studentList.innerHTML = '<div class="no-results"><p>No students found</p></div>';
        return;
    }
    studentsToDisplay.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';
        studentDiv.innerHTML = `<input type="radio" name="student" value="${student.name}" data-usn="${student.usn || ''}" id="student-${student.name}"><label for="student-${student.name}">${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></label>`;
        studentList.appendChild(studentDiv);
    });
    studentList.querySelectorAll('input[type="radio"]').forEach(radio => radio.addEventListener('change', () => {
        document.getElementById('submit-attendance').disabled = false;
        document.querySelectorAll('.student-checkbox').forEach(box => box.classList.remove('selected'));
        radio.parentElement.classList.add('selected');
    }));
}

function setupStudentEventListeners() {
    document.getElementById('submit-attendance')?.addEventListener('click', submitAttendance);
    document.getElementById('close-success')?.addEventListener('click', () => window.close());
}

async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) return alert("Please select your name.");

    const sessionId = new URLSearchParams(window.location.search).get('session');
    if (!sessionId) return alert("Invalid session. Please scan the QR code again.");

    const submitBtn = document.getElementById('submit-attendance');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const { error } = await supabaseClient.from('attendance').insert({
            student: selectedRadio.value,
            usn: selectedRadio.getAttribute('data-usn'),
            session_id: sessionId,
            device_id: 'student_device'
        });

        if (error?.code === '23505') {
            alert("You have already submitted your attendance for this session.");
        } else if (error) {
            throw error;
        } else {
            document.getElementById('student-selection-page').style.display = 'none';
            document.getElementById('success-page').style.display = 'block';
        }
    } catch (err) {
        alert("Failed to submit attendance: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
}

// =================================================================
// MODAL, SEARCH, AND UTILITY FUNCTIONS
// =================================================================

function showStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'block';
    populateStudentListDisplay(); // Initial population
}

function closeStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'none';
}

function populateStudentListDisplay(searchTerm = '') {
    const display = document.getElementById('student-list-display');
    if (!display) return;
    display.innerHTML = '';

    const studentsToDisplay = allStudents.filter(s => searchTerm === '' || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm)));

    if (studentsToDisplay.length === 0) {
        display.innerHTML = '<div class="no-students-message">No students found.</div>';
    } else {
        studentsToDisplay.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `<span class="student-name">${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></span><button class="delete-student-btn" onclick="deleteStudent('${student.name}')">🗑️ Delete</button>`;
            display.appendChild(item);
        });
    }
    updateStudentCount();
}

async function addNewStudent() {
    const nameInput = document.getElementById('new-student-name');
    const usnInput = document.getElementById('new-student-usn');
    const studentName = nameInput.value.trim();
    if (!studentName) return alert('Please enter a student name.');
    if (allStudents.some(s => s.name.toLowerCase() === studentName.toLowerCase())) return alert('A student with this name already exists.');

    try {
        await supabaseClient.from('students').insert({ name: studentName, usn: usnInput.value.trim() || null });
        nameInput.value = '';
        usnInput.value = '';
        await fetchAllStudents();
        populateStudentListDisplay();
    } catch (err) {
        alert('Failed to add student: ' + err.message);
    }
}

async function deleteStudent(studentName) {
    if (!confirm(`This will permanently delete ${studentName}. Continue?`)) return;
    try {
        await supabaseClient.from('students').delete().eq('name', studentName);
        await fetchAllStudents();
        populateStudentListDisplay();
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
    document.getElementById('student-search-manual')?.addEventListener('input', (e) => populateFacultyStudentDropdown(e.target.value.toLowerCase().trim()));
}

/**
 * ✅ THIS IS THE NEW FUNCTION THAT FIXES THE BUG
 * It attaches an event listener to the search input inside the "Manage Student List" modal.
 */
function setupStudentListSearch() {
    const searchInput = document.getElementById('student-list-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            populateStudentListDisplay(searchTerm);
        });
    }
}

function setupStudentSearchForSelection() {
    document.getElementById('student-search')?.addEventListener('input', (e) => populateStudentListForSelection(e.target.value.toLowerCase().trim()));
}

function populateFacultyStudentDropdown(searchTerm = '') {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    
    const unpresentStudents = allStudents.filter(s => !presentStudents.includes(s.name) && (searchTerm === '' || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm))));

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
        await supabaseClient.from('attendance').insert({ 
            student: studentName, usn: studentUSN, session_id: localStorage.getItem('sessionId'), device_id: 'manual_admin'
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

async function logout() {
    await supabaseClient.auth.signOut();
    localStorage.clear();
    window.location.href = 'login.html';
}
