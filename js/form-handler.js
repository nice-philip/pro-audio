// Form submission handler
async function handleSubmit(event) {
    event.preventDefault();
    
    try {
        const formData = new FormData(event.target);
        
        const response = await fetch('https://pro-audio.onrender.com/api/reservations', {
            method: 'POST',
            headers: {
                'Origin': 'https://surroundio.life'
            },
            body: formData,
            mode: 'cors' // Enable CORS
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        alert('✅ 予約が完了しました！');
        event.target.reset();
        
    } catch (error) {
        console.error('Error:', error);
        alert('❌ エラーが発生しました。しばらくしてからもう一度お試しください。');
    }
}

export { handleSubmit }; 