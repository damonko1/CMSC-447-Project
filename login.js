function handleLogin(event){
    event.preventDefault();
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessageDiv = document.getElementById('error-message');

    const username = usernameInput.value;
    const password = passwordInput.value;

    const validUser = 'user123';
    const validPass = 'pass123';

    if (username == validUser && password == validPass){
        errorMessageDiv.style.display = 'none';
    }
    else{
        errorMessageDiv.textContent = 'Incorrect username or password';
        errorMessageDiv.style.display = 'block';
        passwordInput.value = '';
    }
}

const loginform = document.getElementById('loginform');
loginform.addEventListener('submit', handleLogin);
