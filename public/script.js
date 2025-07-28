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
// =================================================================
// ... keep all the code above this line ...
// =================================================================

// =================================================================
// NEW: COURSE MANAGEMENT FUNCTIONS
// =================================================================
let currentCourseId = null; // A global variable to track which course is being edited

function showCoursesModal() {
    document.getElementById('courses-modal').style.display = 'block';
    backToCoursesList(); // Ensure we start on the main course list view
    populateCoursesList();
}

function closeCoursesModal() {
    document.getElementById('courses-modal').style.display = 'none';
}

function backToCoursesList() {
    document.getElementById('course-list-view').style.display = 'block';
    document.getElementById('course-management-view').style.display = 'none';
    currentCourseId = null; // Clear the current course ID
}

async function populateCoursesList() {
    const listDisplay = document.getElementById('courses-list-display');
    listDisplay.innerHTML = '<div class="student-item">Loading courses...</div>';

    try {
        const { data, error } = await supabaseClient.from('courses').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        listDisplay.innerHTML = '';
        if (data.length === 0) {
            listDisplay.innerHTML = '<div class="no-students-message">No courses created yet.</div>';
            return;
        }

        data.forEach(course => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <span class="student-name">${course.course_name}</span>
                <button class="add-student-btn" onclick="showCourseManagementView(${course.id}, '${course.course_name}')">Manage</button>
            `;
            listDisplay.appendChild(item);
        });
    } catch (err) {
        console.error('Error fetching courses:', err);
        listDisplay.innerHTML = '<div class="no-students-message">Could not load courses.</div>';
    }
}

async function createNewCourse() {
    const courseNameInput = document.getElementById('new-course-name');
    const courseName = courseNameInput.value.trim();
    if (!courseName) return alert('Please enter a course name.');

    try {
        await supabaseClient.from('courses').insert({ course_name: courseName });
        courseNameInput.value = '';
        populateCoursesList(); // Refresh the list
    } catch (err) {
        console.error('Error creating course:', err);
        alert('Failed to create course.');
    }
}

function showCourseManagementView(courseId, courseName) {
    currentCourseId = courseId; // Set the global course ID
    document.getElementById('course-list-view').style.display = 'none';
    document.getElementById('course-management-view').style.display = 'block';
    document.getElementById('course-management-title').textContent = `Managing: ${courseName}`;
    
    populateCourseStudentList(courseId);
    populateAddStudentToCourseList(courseId);

    // Setup search listener for adding students
    const searchInput = document.getElementById('add-student-search');
    searchInput.oninput = () => populateAddStudentToCourseList(courseId, searchInput.value.trim().toLowerCase());
}

async function populateCourseStudentList(courseId) {
    const listDisplay = document.getElementById('course-student-list-display');
    listDisplay.innerHTML = '<div class="student-item">Loading enrolled students...</div>';

    // This is a more advanced query to get student names from the `students` table
    // based on the `student_usn` in the `student_courses` linking table.
    try {
        const { data, error } = await supabaseClient
            .from('student_courses')
            .select(`
                students (name, usn)
            `)
            .eq('course_id', courseId);
            
        if (error) throw error;

        listDisplay.innerHTML = '';
        const enrolledStudents = data.map(item => item.students);

        if (enrolledStudents.length === 0) {
            listDisplay.innerHTML = '<div class="no-students-message">No students enrolled.</div>';
            return;
        }

        enrolledStudents.forEach(student => {
            if (!student) return; // Safeguard if a student was deleted but the enrollment link remains
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <span class="student-name">${student.name} <sub style="color:#666">${student.usn}</sub></span>
                <button class="remove-btn" onclick="removeStudentFromCourse('${student.usn}', ${courseId})">Remove</button>
            `;
            listDisplay.appendChild(item);
        });
    } catch (err) {
        console.error('Error fetching enrolled students:', err);
    }
}

async function populateAddStudentToCourseList(courseId, searchTerm = '') {
    const addListDisplay = document.getElementById('add-student-to-course-display');
    addListDisplay.innerHTML = '<div class="student-item">Loading...</div>';

    // Get students already enrolled in THIS course
    const { data: enrolledData, error: enrolledError } = await supabaseClient
        .from('student_courses')
        .select('student_usn')
        .eq('course_id', courseId);

    if (enrolledError) return;
    const enrolledUsns = enrolledData.map(item => item.student_usn);

    // Filter all students to find who is NOT enrolled and matches the search
    let unenrolledStudents = allStudents.filter(student => student.usn && !enrolledUsns.includes(student.usn));
    if (searchTerm) {
        unenrolledStudents = unenrolledStudents.filter(student => 
            student.name.toLowerCase().includes(searchTerm) ||
            student.usn.toLowerCase().includes(searchTerm)
        );
    }

    addListDisplay.innerHTML = '';
    if (unenrolledStudents.length === 0) {
        addListDisplay.innerHTML = '<div class="no-students-message">No students to add.</div>';
        return;
    }

    unenrolledStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'student-list-item';
        item.innerHTML = `
            <span class="student-name">${student.name} <sub style="color:#666">${student.usn}</sub></span>
            <button class="add-student-btn" onclick="addStudentToCourse('${student.usn}', ${courseId})">Add</button>
        `;
        addListDisplay.appendChild(item);
    });
}

async function addStudentToCourse(studentUsn, courseId) {
    try {
        await supabaseClient.from('student_courses').insert({ student_usn: studentUsn, course_id: courseId });
        // Refresh both lists
        populateCourseStudentList(courseId);
        populateAddStudentToCourseList(courseId);
    } catch (err) {
        console.error('Error adding student to course:', err);
    }
}

async function removeStudentFromCourse(studentUsn, courseId) {
    try {
        await supabaseClient.from('student_courses').delete().match({ student_usn: studentUsn, course_id: courseId });
        // Refresh both lists
        populateCourseStudentList(courseId);
        populateAddStudentToCourseList(courseId);
    } catch (err) {
        console.error('Error removing student from course:', err);
    }
}

async function deleteCourse() {
    if (!currentCourseId) return;
    if (!confirm("⚠️ Are you sure you want to permanently delete this course and all its enrollment records? This cannot be undone.")) return;

    try {
        await supabaseClient.from('courses').delete().eq('id', currentCourseId);
        alert('Course deleted successfully.');
        backToCoursesList(); // Go back to the main list
        populateCoursesList(); // Refresh the list
    } catch (err) {
        console.error('Error deleting course:', err);
        alert('Failed to delete course.');
    }
}
