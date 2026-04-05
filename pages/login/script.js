// Login page script


    // Buttons
        var loginBtn=document.querySelector("#loginButton");
        loginBtn.addEventListener("click", checkLogin);

        var manageBtn=document.querySelector("#manageButton");
        var proBtn=document.querySelector("#proButton");
        var premiumBtn=document.querySelector("#premiumButton");
        var closeBtn=document.querySelector("#closeButton");

    // Function: Matching Username and Password before logging in
        function checkLogin() {
        var usernameTyped=document.querySelector("#usernameInput").value;
        var errorText1=document.querySelector("#error1");
        var passwordTyped=document.querySelector("#passwordInput").value;
        var errorText2=document.querySelector("#error2");
        var successText=document.querySelector("#success");

        // Clearing error message when Login button is clicked again
        errorText1.textContent = "";
        errorText2.textContent = "";
        successText.textContent = "";

            if(usernameTyped==="admin" && passwordTyped!=="1234"){
                errorText2.textContent="Incorrect password";
            }
            else if(usernameTyped!=="admin" && passwordTyped==="1234"){
                errorText1.textContent="Incorrect username";
            }
            else if(usernameTyped!=="admin" && passwordTyped!=="1234"){
                errorText1.textContent="Incorrect username";
                errorText2.textContent="Incorrect password";
            }
            else {
                successText.textContent="IT WORKED!";
            }
        }
