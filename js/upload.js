// Form submission handler
document.getElementById('albumForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Validate form
    if (!validateForm()) {
        return;
    }

    // Show loading overlay
    document.getElementById('loadingOverlay').style.display = 'flex';

    try {
        const formData = new FormData(this);
        
        // Add additional metadata
        formData.append('submissionDate', new Date().toISOString());
        
        // Send the form data
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const result = await response.json();
        alert('申请已完成。');
        window.location.href = '/confirmation.html';

    } catch (error) {
        console.error('Error:', error);
        alert('发生错误。请再试一次。');
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
});

// Form validation
function validateForm() {
    // Required fields validation
    const requiredFields = document.querySelectorAll('[required]');
    for (const field of requiredFields) {
        if (!field.value) {
            alert('请输入必填项目。');
            field.focus();
            return false;
        }
    }

    // Image validation
    const imageFile = document.querySelector('input[name="albumCover"]').files[0];
    if (imageFile) {
        if (imageFile.size > 10 * 1024 * 1024) { // 10MB limit
            alert('图像大小应为10MB以下。');
            return false;
        }
    }

    // Agreement checkboxes validation
    const agreements = [
        'agreementAll',
        'rightsAgreement',
        'reReleaseAgreement',
        'platformAgreement'
    ];

    for (const agreement of agreements) {
        const checkbox = document.querySelector(`input[name="${agreement}"]`);
        if (!checkbox.checked) {
            alert('请勾选所有同意事项。');
            checkbox.focus();
            return false;
        }
    }

    // Platform selection validation
    const platforms = document.querySelectorAll('input[name="platforms[]"]:checked');
    if (platforms.length === 0) {
        alert('请至少选择一个平台。');
        return false;
    }

    return true;
}

// Dynamic input field handling
function addInput(containerId, fieldName) {
    const container = document.getElementById(containerId);
    const newInput = document.createElement('div');
    newInput.className = 'input-group';
    newInput.innerHTML = `
        <input type="text" name="${fieldName}[]" class="form-control" required>
        <span class="input-group-btn">
            <button type="button" class="btn btn-danger" onclick="removeInput(this)">-</button>
        </span>
    `;
    container.appendChild(newInput);
}

function removeInput(button) {
    button.closest('.input-group').remove();
}

// Song section handling
function addSong() {
    const songSection = document.getElementById('songSection');
    const newSong = document.querySelector('.song-entry').cloneNode(true);
    
    // Clear input fields
    newSong.querySelectorAll('input[type="text"], textarea').forEach(input => {
        input.value = '';
    });
    
    // Uncheck radio buttons
    newSong.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.checked = false;
    });
    
    // Reset select elements
    newSong.querySelectorAll('select').forEach(select => {
        select.selectedIndex = 0;
    });
    
    songSection.insertBefore(newSong, songSection.lastElementChild);
}

// Initialize datepicker with restrictions
$(document).ready(function() {
    const today = new Date();
    const threeWeeksLater = new Date();
    threeWeeksLater.setDate(today.getDate() + 21); // 3 weeks later

    $("#date").datepicker({
        minDate: threeWeeksLater,
        dateFormat: 'yy年mm月dd日',
        beforeShow: function(input, inst) {
            inst.dpDiv.addClass('custom-datepicker');
        }
    });
}); 