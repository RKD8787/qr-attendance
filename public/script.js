// Global Supabase client
let supabaseClient = null;

// Global state variables
let allStudents = [];
let presentStudents = [];
let currentCourseId = null;
let currentSession = null;
let allSessions = [];
let currentPage = 1;
const sessionsPerPage = 10;
// ✅ MAIN ENTRY POINT
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Initializes the Supabase client, checks auth, fetches data, and starts the correct UI.
 */
async function initializeApp() {
    try {
        const SUPABASE_URL = 'https://zpesqzstorixfsmpntsx.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ';
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
        console.error('Database connection error:', error);
        return alert('FATAL: Could not connect to the database.');
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    const isStudentPage = window.location.pathname.includes('student.html');

    if (!session && !isStudentPage) {
        return window.location.href = 'login.html';
    }

    await fetchAllStudents();

    if (isStudentPage) {
        initStudentView();
    } else {
        initFacultyView(session);
    }
}

// =================================================================
// DATA FETCHING & STATE
// =================================================================

async function fetchAllStudents() {
    try {
        const { data, error } = await supabaseClient
            .from('students')
            .select('name, usn')
            .order('name', { ascending: true });
        
        if (error) throw error;
        allStudents = data || [];
        console.log('✅ Fetched students:', allStudents.length);
    } catch (err) {
        console.error('Error fetching students:', err);
        allStudents = [];
    }
}

async function fetchCurrentSessionAttendance() {
    if (!currentSession) {
        updatePresentStudentsList([]);
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp')
            .eq('session_id', currentSession.id)
            .order('timestamp', { ascending: false });

        if (error) throw error;
        
        const attendanceData = data || [];
        presentStudents = attendanceData.map(record => record.student);
        updatePresentStudentsList(attendanceData);
        console.log('✅ Fetched attendance:', attendanceData.length, 'students');
    } catch (err) {
        console.error('Error fetching attendance:', err);
        updatePresentStudentsList([]);
    }
}

/**
 * The single source of truth for managing the active session state.
 */
function updateActiveSession(sessionData) {
    currentSession = sessionData;
    const qrContainer = document.getElementById('qr-code-container');
    const sessionTitle = document.getElementById('current-session-title');

    if (sessionData) {
        localStorage.setItem('sessionId', sessionData.id);
        const courseName = sessionData.courses ? sessionData.courses.course_name : 'General';
        if (sessionTitle) {
            sessionTitle.textContent = `Active Session: ${sessionData.session_name} (${courseName})`;
        }
        generateQR(sessionData.id);
        fetchCurrentSessionAttendance();
        console.log('✅ Session updated:', sessionData.session_name);
    } else {
        localStorage.removeItem('sessionId');
        if (sessionTitle) {
            sessionTitle.textContent = 'No Active Session';
        }
        if (qrContainer) {
            qrContainer.innerHTML = '<p style="color: #999; font-size: 16px; text-align: center; padding: 40px;">Start a new session to generate a QR code.</p>';
        }
        updatePresentStudentsList([]);
        console.log('✅ Session cleared');
    }
}

// =================================================================
// FACULTY VIEW (`index.html`)
// =================================================================

function initFacultyView() {
    console.log('🚀 Initializing faculty view...');
    
    const lastSessionId = localStorage.getItem('sessionId');
    if (lastSessionId) {
        console.log('🔄 Resuming session:', lastSessionId);
        supabaseClient
            .from('sessions')
            .select('*, courses(course_name)')
            .eq('id', lastSessionId)
            .single()
            .then(({ data, error }) => {
                if (data && !error) {
                    updateActiveSession(data);
                } else {
                    console.log('❌ Previous session not found, clearing state');
                    updateActiveSession(null);
                }
            });
    } else {
        updateActiveSession(null);
    }
    
    // Set up polling and event listeners
    setInterval(fetchCurrentSessionAttendance, 5000);
    setupAllModalSearchListeners();
    console.log('✅ Faculty view initialized');
}

function generateQR(sessionId) {
    const qrContainer = document.getElementById('qr-code-container');
    if (!qrContainer) {
        console.error('❌ QR container not found');
        return;
    }

    console.log('🔄 Generating QR code for session:', sessionId);
    qrContainer.innerHTML = '';
    
    try {
        const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;
        console.log('🔗 Student URL:', studentUrl);
        
        if (typeof QRious === 'undefined') {
            console.error('❌ QRious library not loaded');
            qrContainer.innerHTML = '<p style="color: #dc3545; text-align: center; padding: 40px;">QR code library not loaded. Please refresh the page.</p>';
            return;
        }
        
        const canvas = document.createElement('canvas');
        qrContainer.appendChild(canvas);
        
        new QRious({
            element: canvas,
            value: studentUrl,
            size: 400,
            padding: 10,
            level: 'H',
            background: 'white',
            foreground: 'black'
        });
        
        console.log('✅ QR code generated successfully');
    } catch (error) {
        console.error('❌ QR generation error:', error);
        qrContainer.innerHTML = '<p style="color: #dc3545; text-align: center; padding: 40px;">Failed to generate QR code. Please try again.</p>';
    }
}

function updatePresentStudentsList(attendanceData) {
    const listElement = document.getElementById('present-students-list');
    updatePresentCount(attendanceData.length);

    if (!listElement) return;
    listElement.innerHTML = '';

    if (attendanceData.length === 0) {
        listElement.innerHTML = '<div class="student-item" style="opacity: 0.5; font-style: italic;">No students present</div>';
        return;
    }

    attendanceData.forEach(record => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';
        studentDiv.innerHTML = `
            <span>${record.student} <sub style="color: #666;">${record.usn || 'N/A'}</sub></span>
            <button class="remove-btn" onclick="removeStudentFromSession('${record.student.replace(/'/g, "\\'")}')">Remove</button>
        `;
        listElement.appendChild(studentDiv);
    });
}

function updatePresentCount(count) {
    const countElement = document.getElementById('present-count');
    if (countElement) {
        countElement.textContent = count;
    }
}

async function removeStudentFromSession(studentName) {
    if (!currentSession || !confirm(`Remove ${studentName} from this session?`)) return;
    
    try {
        const { error } = await supabaseClient
            .from('attendance')
            .delete()
            .match({ student: studentName, session_id: currentSession.id });
            
        if (error) throw error;
        fetchCurrentSessionAttendance();
        console.log('✅ Student removed:', studentName);
    } catch (err) {
        console.error('Error removing student:', err);
        alert('Failed to remove student: ' + err.message);
    }
}

// =================================================================
// STUDENT VIEW (`student.html`)
// =================================================================

function initStudentView() {
    console.log('🚀 Initializing student view...');
    populateStudentListForSelection();
    setupStudentEventListeners();
}

function populateStudentListForSelection(searchTerm = '') {
    const studentList = document.getElementById('student-list');
    if (!studentList) return;
    
    const studentsToDisplay = allStudents.filter(s => 
        searchTerm === '' || 
        s.name.toLowerCase().includes(searchTerm) || 
        (s.usn && s.usn.toLowerCase().includes(searchTerm))
    );
    
    studentList.innerHTML = '';
    if (studentsToDisplay.length === 0) {
        studentList.innerHTML = '<div class="no-results"><p>No students found</p></div>';
        return;
    }
    
    studentsToDisplay.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';
        studentDiv.innerHTML = `
            <input type="radio" name="student" value="${student.name}" data-usn="${student.usn || ''}" id="student-${student.usn}">
            <label for="student-${student.usn}">${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></label>
        `;
        studentList.appendChild(studentDiv);
    });
    
    studentList.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const submitBtn = document.getElementById('submit-attendance');
            if (submitBtn) submitBtn.disabled = false;
            
            document.querySelectorAll('.student-checkbox').forEach(box => 
                box.classList.remove('selected')
            );
            radio.parentElement.classList.add('selected');
        });
    });
}

function setupStudentEventListeners() {
    const submitBtn = document.getElementById('submit-attendance');
    const closeBtn = document.getElementById('close-success');
    const searchInput = document.getElementById('student-search');

    if (submitBtn) {
        submitBtn.addEventListener('click', submitAttendance);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => window.close());
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => 
            populateStudentListForSelection(e.target.value.toLowerCase().trim())
        );
    }
}

async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) {
        return alert("Please select your name.");
    }

    const sessionId = new URLSearchParams(window.location.search).get('session');
    if (!sessionId) {
        return alert("Invalid or missing session. Please scan the QR code again.");
    }

    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }

    try {
        const { error } = await supabaseClient
            .from('attendance')
            .insert({
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
            const selectionPage = document.getElementById('student-selection-page');
            const successPage = document.getElementById('success-page');
            
            if (selectionPage) selectionPage.style.display = 'none';
            if (successPage) successPage.style.display = 'block';
            
            console.log('✅ Attendance submitted successfully');
        }
    } catch (err) {
        console.error('Attendance submission error:', err);
        alert("Failed to submit attendance: " + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Attendance';
        }
    }
}

// =================================================================
// SESSION MANAGEMENT (START NEW / HISTORY)
// =================================================================

async function showCourseSelectionModal() {
    try {
        // Fetch all courses with more details
        const { data: courses, error } = await supabaseClient
            .from('courses')
            .select('*')
            .order('course_name', { ascending: true });
            
        if (error) {
            console.error('Error fetching courses:', error);
            throw error;
        }
        
        if (!courses || courses.length === 0) {
            return alert('No courses found. Please create a course first via the "Manage Courses" button.');
        }

        // Create enhanced modal with search functionality
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'course-selection-modal';
        modal.style.display = 'block';
        
        // Close modal when clicking outside
        modal.onclick = (e) => { 
            if (e.target === modal) {
                modal.remove();
                document.removeEventListener('keydown', handleCourseSearchKeydown);
            }
        };
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3>🚀 Select Course to Start Session</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove(); document.removeEventListener('keydown', handleCourseSearchKeydown)">&times;</button>
                </div>
                
                <!-- Search Section -->
                <div class="search-container" style="margin-bottom: 20px;">
                    <input type="text" id="course-selection-search" placeholder="Search courses by name or ID..." autocomplete="off">
                    <div class="search-icon">🔍</div>
                </div>
                
                <!-- Course Count -->
                <div class="student-count-header" style="margin-bottom: 15px;">
                    Available Courses: <span id="course-selection-count">${courses.length}</span>
                </div>
                
                <!-- Courses List -->
                <div class="student-list-display" id="course-selection-list" style="max-height: 400px; overflow-y: auto;">
                    <!-- Courses will be populated here -->
                </div>
                
                <!-- Quick Actions -->
                <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #e9ecef; text-align: center;">
                    <button class="modal-btn secondary" onclick="this.closest('.modal').remove(); document.removeEventListener('keydown', handleCourseSearchKeydown)" style="margin-right: 10px;">
                        Cancel
                    </button>
                    <button class="modal-btn primary" onclick="showCoursesModal(); this.closest('.modal').remove(); document.removeEventListener('keydown', handleCourseSearchKeydown)">
                        + Create New Course
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Populate the course list
        populateCourseSelectionList(courses);
        
        // Setup search functionality
        setupCourseSelectionSearch(courses);
        
        // Focus on search input
        setTimeout(() => {
            const searchInput = document.getElementById('course-selection-search');
            if (searchInput) searchInput.focus();
        }, 100);
        
        console.log('✅ Course selection modal created with', courses.length, 'courses');
        
    } catch (err) {
        console.error('Error creating course selection modal:', err);
        alert('Could not load courses: ' + err.message);
    }
}
function populateCourseSelectionList(courses, searchTerm = '') {
    const listContainer = document.getElementById('course-selection-list');
    const countElement = document.getElementById('course-selection-count');
    
    if (!listContainer) return;
    
    // Filter courses based on search term
    const filteredCourses = courses.filter(course => {
        if (!searchTerm.trim()) return true;
        
        const searchLower = searchTerm.toLowerCase();
        const nameMatch = course.course_name.toLowerCase().includes(searchLower);
        const idMatch = course.course_id && course.course_id.toLowerCase().includes(searchLower);
        
        return nameMatch || idMatch;
    });
    
    // Update count
    if (countElement) {
        countElement.textContent = filteredCourses.length;
    }
    
    // Clear and populate list
    listContainer.innerHTML = '';
    
    if (filteredCourses.length === 0) {
        listContainer.innerHTML = `
            <div class="no-students-message">
                ${searchTerm.trim() ? 'No courses found matching your search.' : 'No courses available.'}
                <br><br>
                <button class="modal-btn primary" onclick="showCoursesModal(); document.getElementById('course-selection-modal').remove(); document.removeEventListener('keydown', handleCourseSearchKeydown)">
                    Create Your First Course
                </button>
            </div>
        `;
        return;
    }
    
    filteredCourses.forEach(course => {
        const courseItem = document.createElement('div');
        courseItem.className = 'student-list-item course-selection-item';
        courseItem.style.cursor = 'pointer';
        courseItem.style.transition = 'all 0.3s ease';
        
        // Create course display with highlighting for search terms
        let courseName = course.course_name;
        let courseId = course.course_id || 'No ID';
        
        if (searchTerm.trim()) {
            const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            courseName = courseName.replace(regex, '<mark style="background: #ffeb3b; padding: 2px;">$1</mark>');
            if (course.course_id) {
                courseId = courseId.replace(regex, '<mark style="background: #ffeb3b; padding: 2px;">$1</mark>');
            }
        }
        
        courseItem.innerHTML = `
            <div style="flex-grow: 1;">
                <div class="student-name" style="font-size: 16px; margin-bottom: 5px;">
                    ${courseName}
                </div>
                <small style="color: #666; font-size: 13px;">
                    Course ID: <strong style="color: #007bff;">${courseId}</strong>
                    ${course.course_description ? `<br>Description: ${course.course_description}` : ''}
                </small>
            </div>
            <div style="display: flex; align-items: center;">
                <button class="add-student-btn" style="background: linear-gradient(135deg, #17a2b8, #138496); white-space: nowrap;">
                    🚀 Start Session
                </button>
            </div>
        `;
        
        // Add click handlers
        courseItem.onclick = () => startSessionForCourse(course.id, course.course_name, course.course_id);
        
        // Add hover effects
        courseItem.addEventListener('mouseenter', function() {
            this.style.background = 'linear-gradient(135deg, #e7f3ff, #cce7ff)';
            this.style.transform = 'translateX(5px)';
            this.style.boxShadow = '0 4px 15px rgba(0,123,255,0.2)';
        });
        
        courseItem.addEventListener('mouseleave', function() {
            this.style.background = '';
            this.style.transform = '';
            this.style.boxShadow = '';
        });
        
        listContainer.appendChild(courseItem);
    });
}

function setupCourseSelectionSearch(courses) {
    const searchInput = document.getElementById('course-selection-search');
    if (!searchInput) return;
    
    // Real-time search
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim();
        populateCourseSelectionList(courses, searchTerm);
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', handleCourseSearchKeydown);
    
    // Clear search button
    searchInput.addEventListener('focus', function() {
        if (this.value.trim()) {
            this.select();
        }
    });
}

function handleCourseSearchKeydown(event) {
    const modal = document.getElementById('course-selection-modal');
    if (!modal) return;
    
    // ESC to close modal
    if (event.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleCourseSearchKeydown);
        return;
    }
    
    // Arrow key navigation
    const courseItems = modal.querySelectorAll('.course-selection-item');
    if (courseItems.length === 0) return;
    
    const currentFocused = modal.querySelector('.course-selection-item.keyboard-focused');
    let currentIndex = currentFocused ? Array.from(courseItems).indexOf(currentFocused) : -1;
    
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        currentIndex = (currentIndex + 1) % courseItems.length;
        updateKeyboardFocus(courseItems, currentIndex);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        currentIndex = currentIndex <= 0 ? courseItems.length - 1 : currentIndex - 1;
        updateKeyboardFocus(courseItems, currentIndex);
    } else if (event.key === 'Enter' && currentFocused) {
        event.preventDefault();
        currentFocused.click();
    }
}

function updateKeyboardFocus(courseItems, newIndex) {
    // Remove previous focus
    courseItems.forEach(item => {
        item.classList.remove('keyboard-focused');
        item.style.background = '';
        item.style.transform = '';
        item.style.boxShadow = '';
    });
    
    // Add new focus
    if (courseItems[newIndex]) {
        const item = courseItems[newIndex];
        item.classList.add('keyboard-focused');
        item.style.background = 'linear-gradient(135deg, #fff3cd, #ffeaa7)';
        item.style.transform = 'translateX(5px)';
        item.style.boxShadow = '0 4px 15px rgba(255,193,7,0.3)';
        
        // Scroll into view
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
async function startSessionForCourse(courseId, courseName, courseCode = null) {
    // Close the modal first
    const modal = document.getElementById('course-selection-modal');
    if (modal) {
        modal.remove();
        document.removeEventListener('keydown', handleCourseSearchKeydown);
    }
    
    const displayName = courseCode ? `${courseName} (${courseCode})` : courseName;
    const defaultSessionName = `${displayName} - ${new Date().toLocaleDateString()}`;
    
    const sessionName = prompt(
        `Enter a name for this session:\n\nCourse: ${displayName}`, 
        defaultSessionName
    );
    
    if (!sessionName || !sessionName.trim()) return;

    // Show loading state
    const startButton = document.querySelector('.add-manually-btn.fresh-btn');
    if (startButton) {
        startButton.disabled = true;
        startButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting Session...';
    }

    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .insert({ 
                session_name: sessionName.trim(), 
                course_id: courseId 
            })
            .select('*, courses(course_name, course_id)')
            .single();
            
        if (error) {
            console.error('Error creating session:', error);
            throw error;
        }
        
        updateActiveSession(data);
        
        const successMessage = `✅ Session "${sessionName}" started successfully!\n\nCourse: ${displayName}\nYou can now generate QR codes for attendance.`;
        alert(successMessage);
        
        console.log('✅ Session started:', data);
        
    } catch (err) {
        console.error('Error creating session:', err);
        alert("Failed to create session: " + err.message);
    } finally {
        // Restore button state
        if (startButton) {
            startButton.disabled = false;
            startButton.innerHTML = '<i class="fas fa-rocket"></i> Start New Session';
        }
    }
}

// Quick course creation function (can be called from course selection modal)
async function quickCreateCourse() {
    const courseName = prompt('Enter course name:');
    if (!courseName || !courseName.trim()) return;
    
    const courseId = prompt('Enter course ID (optional):', generateCourseIdFromName(courseName));
    
    try {
        const courseData = { course_name: courseName.trim() };
        if (courseId && courseId.trim()) {
            courseData.course_id = courseId.trim();
        }
        
        const { data: newCourse, error } = await supabaseClient
            .from('courses')
            .insert(courseData)
            .select('*')
            .single();
            
        if (error) throw error;
        
        alert(`Course "${newCourse.course_name}" created successfully!`);
        
        // Immediately start session with the new course
        await startSessionForCourse(newCourse.id, newCourse.course_name, newCourse.course_id);
        
    } catch (err) {
        console.error('Error creating course:', err);
        alert('Failed to create course: ' + err.message);
    }
}

// In script.js

// New function to display sessions with search, sort, and pagination
function displaySessions() {
    const listDisplay = document.getElementById('session-list-display');
    const searchInput = document.getElementById('session-history-search');
    const sortSelect = document.getElementById('session-sort');

    // 1. Filter sessions based on search term
    const searchTerm = searchInput.value.toLowerCase();
    let filteredSessions = allSessions.filter(session => {
        const sessionName = session.session_name.toLowerCase();
        const courseName = session.courses ? session.courses.course_name.toLowerCase() : '';
        return sessionName.includes(searchTerm) || courseName.includes(searchTerm);
    });

    // 2. Sort sessions (if sort dropdown exists)
    if (sortSelect) {
        const sortBy = sortSelect.value;
        filteredSessions.sort((a, b) => {
            switch (sortBy) {
                case 'oldest':
                    return new Date(a.created_at) - new Date(b.created_at);
                case 'name_asc':
                    return a.session_name.localeCompare(b.session_name);
                case 'name_desc':
                    return b.session_name.localeCompare(a.session_name);
                case 'newest':
                default:
                    return new Date(b.created_at) - new Date(a.created_at);
            }
        });
    }

    // 3. Paginate sessions
    const startIndex = (currentPage - 1) * sessionsPerPage;
    const endIndex = startIndex + sessionsPerPage;
    const paginatedSessions = filteredSessions.slice(startIndex, endIndex);

    // 4. Group the paginated sessions by date
    const groupedSessions = paginatedSessions.reduce((acc, session) => {
        const date = new Date(session.created_at).toLocaleDateString('en-CA');
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(session);
        return acc;
    }, {});

    // 5. Render the grouped sessions and pagination
    renderGroupedSessions(groupedSessions);
    renderPaginationControls(filteredSessions.length);
} // <-- The closing brace for displaySessions is here, in the correct place.

// Function to render the date-grouped sessions
function renderGroupedSessions(groupedSessions) {
    const listDisplay = document.getElementById('session-list-display');
    listDisplay.innerHTML = '';

    if (Object.keys(groupedSessions).length === 0) {
        listDisplay.innerHTML = '<div class="no-students-message">No sessions found.</div>';
        return;
    }

    for (const date in groupedSessions) {
        const sessions = groupedSessions[date];
        const dateGroup = document.createElement('details');
        dateGroup.className = 'session-date-group';
        
        const summary = document.createElement('summary');
        summary.className = 'session-date-summary';
        summary.innerHTML = `
            <span>${new Date(date).toDateString()}</span>
            <span class="session-count">${sessions.length} Session(s)</span>
        `;
        dateGroup.appendChild(summary);

        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <div style="flex-grow: 1;">
                    <span class="student-name">${session.session_name}</span>
                    <small style="display: block; color: #666; margin-top: 5px;">
                        Course: ${session.courses?.course_name || 'General'}
                    </small>
                </div>
                <div class="session-item-actions">
                    <button class="action-btn" onclick="viewSessionDetails(${session.id}, '${session.session_name.replace(/'/g, "\\'")}')">View</button>
                    <button class="action-btn edit" onclick="editSession(${session.id}, '${session.session_name.replace(/'/g, "\\'")}')">Edit</button>
                    <button class="action-btn delete" onclick="archiveSession(${session.id}, '${session.session_name.replace(/'/g, "\\'")}')">Delete</button>
                </div>
            `;
            dateGroup.appendChild(item);
        });

        listDisplay.appendChild(dateGroup);
    }
}

// Function to render pagination controls
function renderPaginationControls(totalSessions) {
    const paginationContainer = document.getElementById('session-pagination');
    if (!paginationContainer) return; // Exit if the container doesn't exist
    
    paginationContainer.innerHTML = '';
    const totalPages = Math.ceil(totalSessions / sessionsPerPage);

    if (totalPages <= 1) return;

    // Previous button
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '&laquo; Prev';
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            displaySessions();
        }
    };
    paginationContainer.appendChild(prevButton);

    // Page number indicator
    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    paginationContainer.appendChild(pageIndicator);

    // Next button
    const nextButton = document.createElement('button');
    nextButton.innerHTML = 'Next &raquo;';
    nextButton.disabled = currentPage === totalPages;
    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            displaySessions();
        }
    };
    paginationContainer.appendChild(nextButton);
}

// Function to edit a session
async function editSession(sessionId, currentName) {
    const newName = prompt(`Enter new name for "${currentName}":`, currentName);
    if (!newName || !newName.trim()) return;

    try {
        const { error } = await supabaseClient
            .from('sessions')
            .update({ session_name: newName.trim() })
            .eq('id', sessionId);
        
        if (error) throw error;
        
        alert('Session updated successfully!');
        fetchAllSessions(); // Refresh the list
    } catch (err) {
        console.error('Error updating session:', err);
        alert('Failed to update session: ' + err.message);
    }
}

// Function to "soft delete" (archive) a session
async function archiveSession(sessionId, sessionName) {
    if (!confirm(`Are you sure you want to delete the session "${sessionName}"? This will archive it but preserve its history.`)) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('sessions')
            .update({ is_archived: true })
            .eq('id', sessionId);
        
        if (error) throw error;
        
        alert('Session archived successfully!');
        fetchAllSessions(); // Refresh the list
    } catch (err) {
        console.error('Error archiving session:', err);
        alert('Failed to archive session: ' + err.message);
    }
}
    // 5. Render pagination controls
    renderPaginationControls(filteredSessions.length);
}

// New function to render pagination controls
function renderPaginationControls(totalSessions) {
    const paginationContainer = document.getElementById('session-pagination');
    paginationContainer.innerHTML = '';
    const totalPages = Math.ceil(totalSessions / sessionsPerPage);

    if (totalPages <= 1) return;

    // Previous button
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '&laquo; Prev';
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            displaySessions();
        }
    };
    paginationContainer.appendChild(prevButton);

    // Page number indicator
    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    paginationContainer.appendChild(pageIndicator);

    // Next button
    const nextButton = document.createElement('button');
    nextButton.innerHTML = 'Next &raquo;';
    nextButton.disabled = currentPage === totalPages;
    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            displaySessions();
        }
    };
    paginationContainer.appendChild(nextButton);
}
function backToSessionList() {
    const listContainer = document.getElementById('session-list-container');
    const detailsContainer = document.getElementById('session-details-container');
    
    if (listContainer) listContainer.style.display = 'block';
    if (detailsContainer) detailsContainer.style.display = 'none';
}

async function populateSessionHistory() {
    const listDisplay = document.getElementById('session-list-display');
    if (!listDisplay) return;
    
    listDisplay.innerHTML = '<div class="student-item">Loading sessions...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .select('id, session_name, created_at, courses(course_name)')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        listDisplay.innerHTML = '';
        if (!data || data.length === 0) {
            listDisplay.innerHTML = '<div class="no-students-message">No past sessions found.</div>';
            return;
        }
        
        data.forEach(session => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            const courseName = session.courses ? session.courses.course_name : 'No Course';
            item.innerHTML = `
                <span class="student-name">
                    ${session.session_name}
                    <sub style="color: #6f42c1; display: block; margin-top: 5px;">${courseName}</sub>
                </span>
                <button class="add-student-btn" onclick="viewSessionDetails(${session.id}, '${session.session_name.replace(/'/g, "\\'")}')">
                    View
                </button>
            `;
            listDisplay.appendChild(item);
        });
    } catch (err) {
        console.error('Error loading session history:', err);
        listDisplay.innerHTML = '<div class="no-students-message">Could not load session history.</div>';
    }
}

async function viewSessionDetails(sessionId, sessionName) {
    const listContainer = document.getElementById('session-list-container');
    const detailsContainer = document.getElementById('session-details-container');
    const detailsDisplay = document.getElementById('session-details-display');
    const detailsTitle = document.getElementById('session-details-title');
    
    if (listContainer) listContainer.style.display = 'none';
    if (detailsContainer) detailsContainer.style.display = 'block';
    if (detailsTitle) detailsTitle.textContent = `Attendance for: ${sessionName}`;
    if (detailsDisplay) detailsDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp')
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: true });
            
        if (error) throw error;
        
        if (!detailsDisplay) return;
        
        detailsDisplay.innerHTML = '';
        if (!data || data.length === 0) {
            detailsDisplay.innerHTML = '<div class="no-students-message">No attendance recorded.</div>';
            return;
        }
        
        data.forEach(record => {
            const item = document.createElement('div');
            item.className = 'student-item';
            item.innerHTML = `
                <span>${record.student} <sub style="color: #666;">${record.usn || ''}</sub></span>
                <span>${new Date(record.timestamp).toLocaleTimeString()}</span>
            `;
            detailsDisplay.appendChild(item);
        });
    } catch (err) {
        console.error('Error loading session details:', err);
        if (detailsDisplay) {
            detailsDisplay.innerHTML = '<div class="no-students-message">Could not load details.</div>';
        }
    }
}

// =================================================================
// MODALS (COURSES, STUDENTS, MANUAL ADD)
// =================================================================

function setupAllModalSearchListeners() {
    const studentListSearch = document.getElementById('student-list-search');
    const studentSearchManual = document.getElementById('student-search-manual');
    
    if (studentListSearch) {
        studentListSearch.addEventListener('input', (e) => 
            populateStudentListDisplay(e.target.value.toLowerCase().trim())
        );
    }
    
    if (studentSearchManual) {
        studentSearchManual.addEventListener('input', (e) => 
            populateFacultyStudentDropdown(e.target.value.toLowerCase().trim())
        );
    }
}

function showCoursesModal() { 
    const modal = document.getElementById('courses-modal');
    if (!modal) {
        console.error('Courses modal not found');
        return;
    }
    
    console.log('🚀 Opening courses modal...');
    modal.style.display = 'block';
    
    // Reset to list view
    backToCoursesList(); 
    
    // Load courses with a small delay to ensure modal is fully displayed
    setTimeout(() => {
        populateCoursesList();
    }, 100);
}

function closeCoursesModal() { 
    const modal = document.getElementById('courses-modal');
    if (modal) modal.style.display = 'none';
}

function backToCoursesList() {
    const listView = document.getElementById('course-list-view');
    const managementView = document.getElementById('course-management-view');
    
    if (listView) listView.style.display = 'block';
    if (managementView) managementView.style.display = 'none';
    currentCourseId = null;
}

function renderCourseList(courses) {
    const listDisplay = document.getElementById('courses-list-display');
    if (!listDisplay) return;

    listDisplay.innerHTML = '';
    if (!courses || courses.length === 0) {
        listDisplay.innerHTML = '<div class="no-students-message">No courses created.</div>';
        return;
    }

    courses.forEach(course => {
        const item = document.createElement('div');
        item.className = 'student-list-item';
        item.innerHTML = `
            <div style="flex-grow: 1;">
                <span class="student-name">${course.course_name}</span>
                <small style="display: block; color: #666; margin-top: 5px;">
                    Created: ${new Date(course.created_at).toLocaleDateString()}
                </small>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <button class="add-student-btn" onclick="editCourse(${course.id}, '${course.course_name.replace(/'/g, "\\'")}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="add-student-btn" onclick="showCourseManagementView(${course.id}, '${course.course_name.replace(/'/g, "\\'")}')">
                    <i class="fas fa-cog"></i> Manage
                </button>
                <button class="delete-student-btn" onclick="deleteCourseFromList(${course.id}, '${course.course_name.replace(/'/g, "\\'")}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        listDisplay.appendChild(item);
    });
}
async function populateCoursesList() {
    const listDisplay = document.getElementById('courses-list-display');
    if (!listDisplay) {
        console.error('courses-list-display element not found');
        return;
    }

    // Show loading state
    listDisplay.innerHTML = '<div class="student-item" style="text-align: center; padding: 20px;">Loading courses...</div>';

    try {
        // Fetch courses ordered by database ID
        const { data: courses, error } = await supabaseClient
            .from('courses')
            .select('*')
            .order('id', { ascending: false });

        if (error) {
            console.error('Error fetching courses:', error);
            throw error;
        }

        console.log('📋 Fetched courses:', courses?.length || 0, courses);

        // Clear the loading message
        listDisplay.innerHTML = '';

        if (!courses || courses.length === 0) {
            listDisplay.innerHTML = '<div class="no-students-message">No courses created yet. Create your first course above!</div>';
            return;
        }

        // Render each course
        courses.forEach((course, index) => {
            console.log(`Rendering course ${index + 1}:`, course);
            
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <div style="flex-grow: 1;">
                    <span class="student-name">${course.course_name}</span>
                    <small style="display: block; color: #666; margin-top: 5px;">
                        Course ID: <strong>${course.course_id || 'Not Set'}</strong> | Database ID: ${course.id}
                    </small>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button class="add-student-btn" onclick="editCourseName(${course.id}, '${course.course_name.replace(/'/g, "\\'")}')">
                        ✏️ Edit Name
                    </button>
                    <button class="add-student-btn" onclick="editCourseId(${course.id}, '${(course.course_id || '').replace(/'/g, "\\'")}')">
                        🏷️ Edit ID
                    </button>
                    <button class="add-student-btn" onclick="showCourseManagementView(${course.id}, '${course.course_name.replace(/'/g, "\\'")}')">
                        ⚙️ Manage
                    </button>
                    <button class="delete-student-btn" onclick="deleteCourseFromList(${course.id}, '${course.course_name.replace(/'/g, "\\'")}')">
                        🗑️ Delete
                    </button>
                </div>
            `;
            listDisplay.appendChild(item);
        });

        console.log('✅ Course list rendered successfully');

    } catch (err) {
        console.error('Error loading courses:', err);
        listDisplay.innerHTML = `
            <div class="no-students-message" style="color: #dc3545;">
                Error loading courses: ${err.message}
                <br><br>
                <button class="modal-btn primary" onclick="populateCoursesList()" style="margin-top: 10px;">
                    Try Again
                </button>
            </div>
        `;
    }
}

async function createNewCourse() {
    const courseNameInput = document.getElementById('new-course-name');
    const courseIdInput = document.getElementById('new-course-id');
    
    if (!courseNameInput) return;

    const courseName = courseNameInput.value.trim();
    const courseId = courseIdInput ? courseIdInput.value.trim() : '';
    
    if (!courseName) {
        return alert('Please enter a course name.');
    }

    // Validate course ID format if provided
    if (courseId && !/^[A-Za-z0-9_-]+$/.test(courseId)) {
        return alert('Course ID can only contain letters, numbers, hyphens, and underscores.');
    }

    // Show loading state
    const createBtn = courseNameInput.parentElement.querySelector('.add-student-btn');
    const originalText = createBtn.textContent;
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';

    try {
        // Check if course ID already exists (if provided)
        if (courseId) {
            const { data: existingCourse, error: checkError } = await supabaseClient
                .from('courses')
                .select('id')
                .eq('course_id', courseId)
                .single();

            if (existingCourse && !checkError) {
                alert(`Error: A course with ID "${courseId}" already exists.`);
                return;
            }
        }

        // Insert the new course
        const courseData = { course_name: courseName };
        if (courseId) {
            courseData.course_id = courseId;
        }

        const { data: newCourse, error } = await supabaseClient
            .from('courses')
            .insert(courseData)
            .select('*')
            .single();

        if (error) {
            if (error.code === '23505') {
                alert(`Error: A course with this name or ID already exists.`);
            } else {
                console.error('Create course error:', error);
                throw error;
            }
            return;
        }

        // Clear the input fields
        courseNameInput.value = '';
        if (courseIdInput) courseIdInput.value = '';
        
        // Add a small delay to ensure the database transaction is complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Refresh the course list
        await populateCoursesList();
        
        alert(`Course "${newCourse.course_name}" was created successfully!${newCourse.course_id ? ` (ID: ${newCourse.course_id})` : ''}`);
        console.log('✅ Course created successfully:', newCourse);

    } catch (err) {
        console.error('Error creating course:', err);
        alert(`Failed to create course: ${err.message}`);
    } finally {
        // Restore button state
        createBtn.disabled = false;
        createBtn.textContent = originalText;
    }
}

async function editCourseName(courseDbId, currentName) {
    const newName = prompt(`Edit course name:`, currentName);
    
    if (!newName || newName.trim() === '') {
        return; // User cancelled or entered empty string
    }
    
    const trimmedName = newName.trim();
    
    if (trimmedName === currentName) {
        return; // No change made
    }
    
    try {
        const { error } = await supabaseClient
            .from('courses')
            .update({ course_name: trimmedName })
            .eq('id', courseDbId);
            
        if (error) {
            if (error.code === '23505') {
                alert(`Error: A course named "${trimmedName}" already exists.`);
            } else {
                console.error('Update course name error:', error);
                throw error;
            }
            return;
        }
        
        // Small delay then refresh
        await new Promise(resolve => setTimeout(resolve, 100));
        await populateCoursesList();
        
        alert(`Course renamed to "${trimmedName}" successfully!`);
        console.log('✅ Course name updated:', trimmedName);
        
    } catch (err) {
        console.error('Error updating course name:', err);
        alert('Failed to update course name: ' + err.message);
    }
}
async function editCourseId(courseDbId, currentCourseId) {
    const newCourseId = prompt(
        `Edit course ID (letters, numbers, hyphens, underscores only):`, 
        currentCourseId || ''
    );
    
    if (newCourseId === null) {
        return; // User cancelled
    }
    
    const trimmedId = newCourseId.trim();
    
    // Validate course ID format if not empty
    if (trimmedId && !/^[A-Za-z0-9_-]+$/.test(trimmedId)) {
        return alert('Course ID can only contain letters, numbers, hyphens, and underscores.');
    }
    
    if (trimmedId === currentCourseId) {
        return; // No change made
    }
    
    try {
        // Check if the new course ID already exists (if not empty)
        if (trimmedId) {
            const { data: existingCourse, error: checkError } = await supabaseClient
                .from('courses')
                .select('id')
                .eq('course_id', trimmedId)
                .neq('id', courseDbId) // Exclude current course
                .single();

            if (existingCourse && !checkError) {
                return alert(`Error: A course with ID "${trimmedId}" already exists.`);
            }
        }

        const { error } = await supabaseClient
            .from('courses')
            .update({ course_id: trimmedId || null })
            .eq('id', courseDbId);
            
        if (error) {
            console.error('Update course ID error:', error);
            throw error;
        }
        
        // Small delay then refresh
        await new Promise(resolve => setTimeout(resolve, 100));
        await populateCoursesList();
        
        const message = trimmedId 
            ? `Course ID updated to "${trimmedId}" successfully!`
            : 'Course ID cleared successfully!';
        alert(message);
        console.log('✅ Course ID updated:', trimmedId);
        
    } catch (err) {
        console.error('Error updating course ID:', err);
        alert('Failed to update course ID: ' + err.message);
    }
}
// New function to delete course from the list view
async function deleteCourseFromList(courseDbId, courseName) {
    if (!confirm(`⚠️ Are you sure you want to delete the course "${courseName}"?\n\nThis will also remove all student enrollments for this course and cannot be undone.`)) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('courses')
            .delete()
            .eq('id', courseDbId);
            
        if (error) {
            console.error('Delete course error:', error);
            throw error;
        }
        
        // Small delay then refresh
        await new Promise(resolve => setTimeout(resolve, 100));
        await populateCoursesList();
        
        alert(`Course "${courseName}" has been deleted successfully.`);
        console.log('✅ Course deleted:', courseName);
        
    } catch (err) {
        console.error('Error deleting course:', err);
        alert('Failed to delete course: ' + err.message);
    }
}
// Enhanced showCoursesModal to ensure proper initialization
function showCoursesModal() { 
    const modal = document.getElementById('courses-modal');
    if (!modal) {
        console.error('Courses modal not found');
        return;
    }
    
    console.log('🚀 Opening courses modal...');
    modal.style.display = 'block';
    
    // Reset to list view
    backToCoursesList(); 
    
    // Load courses with a small delay to ensure modal is fully displayed
    setTimeout(() => {
        populateCoursesList();
    }, 100);
}
function generateCourseIdFromName(courseName) {
    return courseName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .substring(0, 20); // Limit length
}

// Function to auto-generate course ID when name is typed
function setupCourseIdAutoGeneration() {
    const nameInput = document.getElementById('new-course-name');
    const idInput = document.getElementById('new-course-id');
    
    if (nameInput && idInput) {
        nameInput.addEventListener('input', function() {
            // Only auto-generate if ID field is empty
            if (!idInput.value.trim()) {
                const suggestedId = generateCourseIdFromName(this.value);
                idInput.placeholder = suggestedId ? `Suggested: ${suggestedId}` : 'Enter course ID (optional)';
            }
        });
    }
}
async function debugCourses() {
    console.log('🔍 Debug: Checking courses in database...');
    try {
        const { data, error } = await supabaseClient
            .from('courses')
            .select('*')
            .order('id', { ascending: false });
            
        if (error) {
            console.error('❌ Debug error:', error);
            return;
        }
        
        console.log('📊 Debug results:');
        console.log('Total courses found:', data?.length || 0);
        console.log('Courses data:', data);
        
        return data;
    } catch (err) {
        console.error('❌ Debug exception:', err);
    }
}
function showCourseManagementView(courseId, courseName) {
    currentCourseId = courseId;
    const listView = document.getElementById('course-list-view');
    const managementView = document.getElementById('course-management-view');
    const managementTitle = document.getElementById('course-management-title');
    
    if (listView) listView.style.display = 'none';
    if (managementView) managementView.style.display = 'block';
    if (managementTitle) managementTitle.textContent = `Managing: ${courseName}`;
    
    const searchInput = document.getElementById('add-student-search');
    if (searchInput) {
        searchInput.oninput = () => 
            populateAddStudentToCourseList(courseId, searchInput.value.trim().toLowerCase());
    }
    
    populateCourseStudentList(courseId);
    populateAddStudentToCourseList(courseId);
}

async function populateCourseStudentList(courseId) {
    const listDisplay = document.getElementById('course-student-list-display');
    if (!listDisplay) return;
    
    listDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('student_courses')
            .select(`students(name, usn)`)
            .eq('course_id', courseId);
            
        if (error) throw error;
        
        const enrolledStudents = data.map(item => item.students).filter(Boolean);
        listDisplay.innerHTML = '';
        
        if (enrolledStudents.length === 0) {
            listDisplay.innerHTML = '<div class="no-students-message">No students enrolled.</div>';
            return;
        }
        
        enrolledStudents.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <span>${student.name} <sub style="color:#666">${student.usn}</sub></span>
                <button class="remove-btn" onclick="removeStudentFromCourse('${student.usn}', ${courseId})">
                    Remove
                </button>
            `;
            listDisplay.appendChild(item);
        });
    } catch (err) { 
        console.error('Error fetching enrolled students:', err);
        listDisplay.innerHTML = '<div class="no-students-message">Error loading students.</div>';
    }
}

async function populateAddStudentToCourseList(courseId, searchTerm = '') {
    const addListDisplay = document.getElementById('add-student-to-course-display');
    if (!addListDisplay) return;
    
    addListDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    
    try {
        const { data: enrolledData, error } = await supabaseClient
            .from('student_courses')
            .select('student_usn')
            .eq('course_id', courseId);
            
        if (error) throw error;
        
        const enrolledUsns = enrolledData.map(item => item.student_usn);
        let unenrolledStudents = allStudents.filter(student => 
            student.usn && !enrolledUsns.includes(student.usn)
        );
        
        if (searchTerm) {
            unenrolledStudents = unenrolledStudents.filter(s => 
                s.name.toLowerCase().includes(searchTerm) || 
                s.usn.toLowerCase().includes(searchTerm)
            );
        }
        
        addListDisplay.innerHTML = '';
        if (unenrolledStudents.length === 0) {
            addListDisplay.innerHTML = '<div class="no-students-message">No available students found.</div>';
            return;
        }
        
        unenrolledStudents.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <span>${student.name} <sub style="color:#666">${student.usn}</sub></span>
                <button class="add-student-btn" onclick="addStudentToCourse('${student.usn}', ${courseId})">
                    Add
                </button>
            `;
            addListDisplay.appendChild(item);
        });
    } catch (err) { 
        console.error('Error populating students to add:', err);
        addListDisplay.innerHTML = '<div class="no-students-message">Error loading available students.</div>';
    }
}

async function addStudentToCourse(studentUsn, courseId) {
    try {
        const { error } = await supabaseClient
            .from('student_courses')
            .insert({ student_usn: studentUsn, course_id: courseId });
            
        if (error) throw error;
        
        populateCourseStudentList(courseId);
        populateAddStudentToCourseList(courseId);
        console.log('✅ Student added to course');
    } catch (err) { 
        console.error('Error adding student to course:', err);
        alert('Failed to add student to course: ' + err.message);
    }
}

async function removeStudentFromCourse(studentUsn, courseId) {
    try {
        const { error } = await supabaseClient
            .from('student_courses')
            .delete()
            .match({ student_usn: studentUsn, course_id: courseId });
            
        if (error) throw error;
        
        populateCourseStudentList(courseId);
        populateAddStudentToCourseList(courseId);
        console.log('✅ Student removed from course');
    } catch (err) { 
        console.error('Error removing student from course:', err);
        alert('Failed to remove student from course: ' + err.message);
    }
}

async function deleteCourse() {
    if (!currentCourseId) {
        alert('No course selected for deletion.');
        return;
    }
    
    // Get the course name for confirmation
    try {
        const { data: course, error: fetchError } = await supabaseClient
            .from('courses')
            .select('course_name')
            .eq('id', currentCourseId)
            .single();
            
        if (fetchError) throw fetchError;
        
        const courseName = course?.course_name || 'Unknown Course';
        
        if (!confirm(`⚠️ Are you sure you want to permanently delete "${courseName}"?\n\nThis will remove:\n• The course itself\n• All student enrollments\n• All associated sessions and attendance records\n\nThis action cannot be undone!`)) {
            return;
        }
        
        const { error } = await supabaseClient
            .from('courses')
            .delete()
            .eq('id', currentCourseId);
            
        if (error) throw error;
        
        // Go back to course list and refresh
        backToCoursesList();
        await populateCoursesList();
        
        alert(`Course "${courseName}" has been permanently deleted.`);
        console.log('✅ Course deleted from management view:', courseName);
        
    } catch (err) {
        console.error('Error deleting course:', err);
        alert('Failed to delete course: ' + err.message);
    }
}
function showStudentListModal() { 
    const modal = document.getElementById('student-list-modal');
    if (modal) {
        modal.style.display = 'block';
        populateStudentListDisplay();
    }
}

function closeStudentListModal() { 
    const modal = document.getElementById('student-list-modal');
    if (modal) modal.style.display = 'none';
}

function populateStudentListDisplay(searchTerm = '') {
    const display = document.getElementById('student-list-display');
    const countEl = document.getElementById('total-student-count');
    if (!display || !countEl) return;

    const studentsToDisplay = allStudents.filter(s => 
        searchTerm === '' || 
        s.name.toLowerCase().includes(searchTerm) || 
        (s.usn && s.usn.toLowerCase().includes(searchTerm))
    );
    
    countEl.textContent = studentsToDisplay.length;
    display.innerHTML = '';
    
    if (studentsToDisplay.length === 0) {
        display.innerHTML = '<div class="no-students-message">No students found.</div>';
    } else {
        studentsToDisplay.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <span>${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></span>
                <button class="delete-student-btn" onclick="deleteStudent('${student.name.replace(/'/g, "\\'")}')">
                    🗑️ Delete
                </button>
            `;
            display.appendChild(item);
        });
    }
}

async function addNewStudent() {
    const nameInput = document.getElementById('new-student-name');
    const usnInput = document.getElementById('new-student-usn');
    
    if (!nameInput || !usnInput) return;
    
    const studentName = nameInput.value.trim();
    const studentUsn = usnInput.value.trim();
    
    if (!studentName || !studentUsn) {
        return alert('Student name and USN are required.');
    }
    
    if (allStudents.some(s => s.usn === studentUsn)) {
        return alert('A student with this USN already exists.');
    }
    
    try {
        const { error } = await supabaseClient
            .from('students')
            .insert({ name: studentName, usn: studentUsn });
            
        if (error) throw error;
        
        nameInput.value = ''; 
        usnInput.value = '';
        await fetchAllStudents();
        populateStudentListDisplay();
        console.log('✅ Student added:', studentName);
    } catch (err) { 
        console.error('Error adding student:', err);
        alert('Failed to add student: ' + err.message); 
    }
}

async function deleteStudent(studentName) {
    if (!confirm(`Permanently delete ${studentName}?`)) return;
    
    try {
        const { error } = await supabaseClient
            .from('students')
            .delete()
            .eq('name', studentName);
            
        if (error) throw error;
        
        await fetchAllStudents();
        populateStudentListDisplay();
        console.log('✅ Student deleted:', studentName);
    } catch (err) { 
        console.error('Error deleting student:', err);
        alert('Failed to delete student: ' + err.message); 
    }
}

function showAddManuallyModal() { 
    if (!currentSession) {
        return alert('Please start a session first before adding students manually.');
    }
    
    const modal = document.getElementById('add-manually-modal');
    if (modal) {
        modal.style.display = 'block';
        populateFacultyStudentDropdown();
    }
}

function closeAddManuallyModal() { 
    const modal = document.getElementById('add-manually-modal');
    if (modal) modal.style.display = 'none';
}

function populateFacultyStudentDropdown(searchTerm = '') {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    
    const unpresentStudents = allStudents.filter(s => 
        !presentStudents.includes(s.name) && 
        (searchTerm === '' || 
         s.name.toLowerCase().includes(searchTerm) || 
         (s.usn && s.usn.toLowerCase().includes(searchTerm)))
    );
    
    dropdown.innerHTML = '';
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
    if (!currentSession || !studentName) return;
    
    if (presentStudents.includes(studentName)) {
        return alert('Student already marked present.');
    }
    
    try {
        const { error } = await supabaseClient
            .from('attendance')
            .insert({ 
                student: studentName, 
                usn: studentUSN, 
                session_id: currentSession.id, 
                device_id: 'manual_admin' 
            });
            
        if (error) throw error;
        
        fetchCurrentSessionAttendance();
        closeAddManuallyModal();
        console.log('✅ Student added manually:', studentName);
    } catch (err) { 
        console.error('Error adding student manually:', err);
        alert('Failed to add student manually: ' + err.message); 
    }
}

async function exportAttendanceCSV() {
    if (!currentSession) {
        return alert("Please start a session to export attendance.");
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp')
            .eq('session_id', currentSession.id);
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            return alert("No attendance data to export for this session.");
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Student,USN,Timestamp,Session\n";
        csvContent += data.map(e => 
            `"${e.student}","${e.usn || ''}","${new Date(e.timestamp).toLocaleString()}","${currentSession.session_name}"`
        ).join("\n");
        
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `attendance_${currentSession.session_name}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ Attendance exported');
    } catch (err) {
        console.error('Error exporting attendance:', err);
        alert('Failed to export attendance: ' + err.message);
    }
}
// Mobile-friendly proxy prevention system
const MOBILE_FRIENDLY_CONFIG = {
    // Enable/disable features
    ENABLE_LOCATION_CHECK: true,
    ENABLE_TIME_WINDOW: true,
    ENABLE_SESSION_LIMITS: true,
    ENABLE_DEVICE_TRACKING: true,
    
    // Location validation (works with any internet connection)
    MAX_DISTANCE_FROM_ADMIN: 200,  // 200 meters radius from teacher
    MIN_GPS_ACCURACY: 50,          // Minimum GPS accuracy required
    
    // Time-based validation
    SESSION_SUBMISSION_WINDOW: 30, // Minutes after QR generation
    ALLOWED_HOURS: { start: 7, end: 20 }, // 7 AM to 8 PM
    
    // Device and behavior tracking
    MAX_SUBMISSIONS_PER_DEVICE: 1, // One submission per device per session
    MIN_TIME_ON_PAGE: 10,          // Minimum seconds on page before submission
    REQUIRE_USER_INTERACTION: true, // Require clicks/scrolls before submission
    
    // Admin notification
    NOTIFY_SUSPICIOUS_ACTIVITY: true
};

/**
 * Simple location-based validation that works with mobile WiFi
 */
async function getLocationBasedValidation() {
    const validation = {
        timestamp: new Date().toISOString(),
        deviceId: getDeviceFingerprint(),
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    // Get GPS location (works with any internet connection)
    validation.location = await getCurrentLocation();
    
    // Track user behavior on page
    validation.behavior = getUserBehaviorMetrics();
    
    // Get battery info (helps detect if device is actually being used)
    validation.battery = await getBatteryLevel();
    
    return validation;
}

/**
 * Get current GPS location with high accuracy
 */
async function getCurrentLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ error: 'GPS not supported' });
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp,
                    altitude: position.coords.altitude,
                    heading: position.coords.heading,
                    speed: position.coords.speed
                });
            },
            (error) => {
                resolve({ 
                    error: error.message,
                    code: error.code 
                });
            },
            options
        );
    });
}

/**
 * Generate device fingerprint for tracking
 */
function getDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
    
    const fingerprint = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.platform,
        navigator.cookieEnabled,
        canvas.toDataURL()
    ].join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
        const char = fingerprint.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return 'device_' + Math.abs(hash).toString(36);
}

/**
 * Track user behavior to detect automated submissions
 */
function getUserBehaviorMetrics() {
    return {
        timeOnPage: Math.floor((Date.now() - window.pageLoadTime) / 1000),
        mouseMovements: window.mouseMovements || 0,
        keyStrokes: window.keyStrokes || 0,
        scrollEvents: window.scrollEvents || 0,
        clickEvents: window.clickEvents || 0,
        focusEvents: window.focusEvents || 0
    };
}

/**
 * Get battery level
 */
async function getBatteryLevel() {
    try {
        if ('getBattery' in navigator) {
            const battery = await navigator.getBattery();
            return {
                level: Math.round(battery.level * 100),
                charging: battery.charging
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Calculate distance between two GPS coordinates
 */
function calculateGPSDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Mobile-friendly attendance submission with location validation
 */
async function submitAttendanceWithLocationValidation() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) {
        return alert("Please select your name.");
    }

    const sessionId = new URLSearchParams(window.location.search).get('session');
    if (!sessionId) {
        return alert("Invalid or missing session. Please scan the QR code again.");
    }

    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying Location...';
    }

    try {
        // Get validation data
        const validationData = await getLocationBasedValidation();
        
        // Validation 1: Check if GPS location is available
        if (MOBILE_FRIENDLY_CONFIG.ENABLE_LOCATION_CHECK) {
            if (validationData.location.error) {
                throw new Error('GPS location is required for attendance. Please enable location access and try again.');
            }
            
            if (validationData.location.accuracy > MOBILE_FRIENDLY_CONFIG.MIN_GPS_ACCURACY) {
                throw new Error(`GPS accuracy too low (${Math.round(validationData.location.accuracy)}m). Please move to an open area and try again.`);
            }
        }

        // Validation 2: Check distance from admin/classroom
        if (MOBILE_FRIENDLY_CONFIG.ENABLE_LOCATION_CHECK) {
            const adminLocation = await getAdminLocationForSession(sessionId);
            if (adminLocation) {
                const distance = calculateGPSDistance(
                    validationData.location.latitude,
                    validationData.location.longitude,
                    adminLocation.lat,
                    adminLocation.lon
                );
                
                if (distance > MOBILE_FRIENDLY_CONFIG.MAX_DISTANCE_FROM_ADMIN) {
                    throw new Error(`You are ${Math.round(distance)}m away from the classroom. Maximum allowed distance is ${MOBILE_FRIENDLY_CONFIG.MAX_DISTANCE_FROM_ADMIN}m.`);
                }
            }
        }

        // Validation 3: Time window check
        if (MOBILE_FRIENDLY_CONFIG.ENABLE_TIME_WINDOW) {
            const sessionStartTime = await getSessionStartTime(sessionId);
            if (sessionStartTime) {
                const minutesSinceStart = (Date.now() - new Date(sessionStartTime)) / (1000 * 60);
                if (minutesSinceStart > MOBILE_FRIENDLY_CONFIG.SESSION_SUBMISSION_WINDOW) {
                    throw new Error(`Attendance window closed. You can only submit attendance within ${MOBILE_FRIENDLY_CONFIG.SESSION_SUBMISSION_WINDOW} minutes of session start.`);
                }
            }
        }

        // Validation 4: Working hours check
        const currentHour = new Date().getHours();
        if (currentHour < MOBILE_FRIENDLY_CONFIG.ALLOWED_HOURS.start || 
            currentHour > MOBILE_FRIENDLY_CONFIG.ALLOWED_HOURS.end) {
            throw new Error(`Attendance can only be submitted between ${MOBILE_FRIENDLY_CONFIG.ALLOWED_HOURS.start}:00 and ${MOBILE_FRIENDLY_CONFIG.ALLOWED_HOURS.end}:00.`);
        }

        // Validation 5: Device tracking
        if (MOBILE_FRIENDLY_CONFIG.ENABLE_DEVICE_TRACKING) {
            const existingSubmission = await checkDeviceAlreadySubmitted(validationData.deviceId, sessionId);
            if (existingSubmission) {
                throw new Error('This device has already submitted attendance for this session.');
            }
        }

        // Validation 6: User interaction check
        if (MOBILE_FRIENDLY_CONFIG.REQUIRE_USER_INTERACTION) {
            const behavior = validationData.behavior;
            if (behavior.timeOnPage < MOBILE_FRIENDLY_CONFIG.MIN_TIME_ON_PAGE) {
                throw new Error('Please spend some time on the page before submitting attendance.');
            }
            
            if (behavior.mouseMovements + behavior.clickEvents + behavior.scrollEvents < 3) {
                throw new Error('Please interact with the page (scroll, click, or move mouse) before submitting.');
            }
        }

        if (submitBtn) {
            submitBtn.textContent = 'Submitting Attendance...';
        }

        // Submit attendance with validation data
        const { error } = await supabaseClient
            .from('attendance')
            .insert({
                student: selectedRadio.value,
                usn: selectedRadio.getAttribute('data-usn'),
                session_id: sessionId,
                device_id: validationData.deviceId,
                validation_data: JSON.stringify(validationData),
                location_verified: true,
                gps_accuracy: validationData.location.accuracy
            });

        if (error?.code === '23505') {
            alert("You have already submitted your attendance for this session.");
        } else if (error) {
            throw error;
        } else {
            // Success
            const selectionPage = document.getElementById('student-selection-page');
            const successPage = document.getElementById('success-page');
            
            if (selectionPage) selectionPage.style.display = 'none';
            if (successPage) successPage.style.display = 'block';
            
            console.log('✅ Attendance submitted successfully with location verification');
        }

    } catch (err) {
        console.error('Attendance submission error:', err);
        alert("Failed to submit attendance: " + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Attendance';
        }
    }
}

/**
 * Get admin location for the session
 */
async function getAdminLocationForSession(sessionId) {
    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .select('admin_location')
            .eq('id', sessionId)
            .single();
            
        if (error) throw error;
        return data?.admin_location ? JSON.parse(data.admin_location) : null;
    } catch (err) {
        console.error('Error getting admin location:', err);
        return null;
    }
}

/**
 * Get session start time
 */
async function getSessionStartTime(sessionId) {
    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .select('created_at')
            .eq('id', sessionId)
            .single();
            
        if (error) throw error;
        return data?.created_at;
    } catch (err) {
        console.error('Error getting session start time:', err);
        return null;
    }
}

/**
 * Check if device already submitted attendance
 */
async function checkDeviceAlreadySubmitted(deviceId, sessionId) {
    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('id')
            .eq('device_id', deviceId)
            .eq('session_id', sessionId)
            .single();
            
        return !error && data;
    } catch (err) {
        return false;
    }
}

/**
 * Enhanced session creation with admin location (works with mobile WiFi)
 */
async function startSessionWithLocationTracking(courseId, courseName, courseCode = null) {
    const modal = document.getElementById('course-selection-modal');
    if (modal) {
        modal.remove();
        document.removeEventListener('keydown', handleCourseSearchKeydown);
    }
    
    const displayName = courseCode ? `${courseName} (${courseCode})` : courseName;
    const defaultSessionName = `${displayName} - ${new Date().toLocaleDateString()}`;
    
    const sessionName = prompt(
        `Enter a name for this session:\n\nCourse: ${displayName}`, 
        defaultSessionName
    );
    
    if (!sessionName || !sessionName.trim()) return;

    const startButton = document.querySelector('.add-manually-btn.fresh-btn');
    if (startButton) {
        startButton.disabled = true;
        startButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting Location...';
    }

    try {
        // Get admin's current location
        const adminLocation = await getCurrentLocation();
        
        if (adminLocation.error) {
            const proceed = confirm('Could not get your location for verification. Students will not be location-verified. Continue anyway?');
            if (!proceed) return;
        }

        const { data, error } = await supabaseClient
            .from('sessions')
            .insert({ 
                session_name: sessionName.trim(), 
                course_id: courseId,
                admin_location: adminLocation.error ? null : JSON.stringify({
                    lat: adminLocation.latitude,
                    lon: adminLocation.longitude,
                    accuracy: adminLocation.accuracy,
                    timestamp: new Date().toISOString()
                })
            })
            .select('*, courses(course_name, course_id)')
            .single();
            
        if (error) throw error;
        
        updateActiveSession(data);
        
        const successMessage = `✅ Session "${sessionName}" started successfully!\n\nCourse: ${displayName}\nLocation verification: ${adminLocation.error ? 'DISABLED (no GPS)' : 'ENABLED'}`;
        alert(successMessage);
        
        console.log('✅ Session started with location tracking:', data);
        
    } catch (err) {
        console.error('Error creating session:', err);
        alert("Failed to create session: " + err.message);
    } finally {
        if (startButton) {
            startButton.disabled = false;
            startButton.innerHTML = '<i class="fas fa-rocket"></i> Start New Session';
        }
    }
}

/**
 * Track user interactions to prevent automated submissions
 */
function initializeUserInteractionTracking() {
    window.pageLoadTime = Date.now();
    window.mouseMovements = 0;
    window.keyStrokes = 0;
    window.scrollEvents = 0;
    window.clickEvents = 0;
    window.focusEvents = 0;

    // Track mouse movements
    document.addEventListener('mousemove', () => {
        window.mouseMovements++;
    });

    // Track key presses
    document.addEventListener('keydown', () => {
        window.keyStrokes++;
    });

    // Track scroll events
    document.addEventListener('scroll', () => {
        window.scrollEvents++;
    });

    // Track click events
    document.addEventListener('click', () => {
        window.clickEvents++;
    });

    // Track focus events
    window.addEventListener('focus', () => {
        window.focusEvents++;
    });
}

/**
 * Show location permission request with instructions
 */
function showLocationPermissionRequest() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; text-align: center;">
            <h3 style="color: #007bff; margin-bottom: 20px;">📍 Location Required</h3>
            <p style="margin-bottom: 20px; line-height: 1.6;">
                To prevent proxy attendance, we need to verify your location. 
                Please allow location access when prompted.
            </p>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; margin: 20px 0;">
                <strong>Why we need location:</strong><br>
                • Ensure you're physically present in class<br>
                • Prevent remote attendance submission<br>
                • Works with any WiFi (including mobile hotspot)
            </div>
            <button class="modal-btn primary" onclick="this.closest('.modal').remove()">
                I Understand
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}
// In script.js

function setupStudentEventListeners() {
    const submitBtn = document.getElementById('submit-attendance');
    const closeBtn = document.getElementById('close-success');
    const searchInput = document.getElementById('student-search');

    if (submitBtn) {
        // REMOVE the original event listener
        // submitBtn.addEventListener('click', submitAttendance); 
        
        // ADD the new, secure event listener
        submitBtn.addEventListener('click', submitAttendanceWithLocationValidation); 
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => window.close());
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => 
            populateStudentListForSelection(e.target.value.toLowerCase().trim())
        );
    }
}
// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.includes('student.html')) {
        // Initialize user interaction tracking
        initializeUserInteractionTracking();
        
        // Show location permission info
        setTimeout(showLocationPermissionRequest, 2000);
        
        // Replace the submit button event listener
        const submitBtn = document.getElementById('submit-attendance');
        if (submitBtn) {
            submitBtn.removeEventListener('click', submitAttendance);
            submitBtn.addEventListener('click', submitAttendanceWithLocationValidation);
        }
    }
    
    // Replace session creation function for faculty
    if (!window.location.pathname.includes('student.html')) {
        // Override the original function
        window.startSessionForCourse = startSessionWithLocationTracking;
    }
});
console.log('📱 Mobile-friendly proxy prevention loaded:', {
    locationCheck: MOBILE_FRIENDLY_CONFIG.ENABLE_LOCATION_CHECK,
    maxDistance: MOBILE_FRIENDLY_CONFIG.MAX_DISTANCE_FROM_ADMIN + 'm',
    timeWindow: MOBILE_FRIENDLY_CONFIG.SESSION_SUBMISSION_WINDOW + ' minutes',
    deviceTracking: MOBILE_FRIENDLY_CONFIG.ENABLE_DEVICE_TRACKING
});
async function logout() {
    try {
        await supabaseClient.auth.signOut();
        localStorage.clear();
        window.location.href = 'login.html';
    } catch (err) {
        console.error('Logout error:', err);
        // Force logout even if there's an error
        localStorage.clear();
        window.location.href = 'login.html';
    }
}
