import { uploadAudio } from './api.js';

async function handleSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton) return; // 버튼이 없으면 함수 종료

    const originalText = submitButton.textContent;
    const formData = new FormData(form);
    
    try {
        // 로딩 상태 표시
        submitButton.textContent = '送信中...';
        submitButton.disabled = true;
        
        const result = await uploadAudio(formData);
        
        // 성공 메시지 표시
        alert('アップロードが完了しました！');
        form.reset();

        // 파일 상태 초기화
        const fileStatus = document.querySelector('.file-status');
        const fileSelectButton = document.querySelector('.file-select-button');
        if (fileStatus) fileStatus.textContent = 'ファイルが選択されていません';
        if (fileSelectButton) fileSelectButton.textContent = 'ファイルを選択';
        
    } catch (error) {
        // 에러 메시지 표시
        console.error('Upload error:', error);
        alert(error.message || 'エラーが発生しました');
    } finally {
        // 버튼 상태 복구
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

// 폼에 이벤트 리스너 추가
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('albumForm');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }
}); 