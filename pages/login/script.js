// Login page script


    // Buttons
            var loginBtn=document.querySelector("#loginButton");
            loginBtn.addEventListener("click", checkLogin);

            var manageBtn=document.querySelector("#manageButton");
            manageBtn.addEventListener("click", showPopup);

            var freeBtn = document.querySelector("#freeButton");
            freeBtn.addEventListener("click", whenClicked);
            
            var proBtn=document.querySelector("#proButton");
            proBtn.addEventListener("click", whenClicked);
            
            var premiumBtn=document.querySelector("#premiumButton");
            premiumBtn.addEventListener("click", whenClicked);

            var freeCol=document.querySelector("#freeColumn");
            var proCol=document.querySelector("#proColumn");
            var premiumCol=document.querySelector("#premiumColumn");

            var closeBtn=document.querySelector("#closeButton");
            closeBtn.addEventListener("click", closePopup);

            var errorText1=document.querySelector("#error1");
            var errorText2=document.querySelector("#error2");


    // Login
        function checkLogin() {
            var usernameTyped=document.querySelector("#usernameInput").value;
            var passwordTyped=document.querySelector("#passwordInput").value;

            errorText1.textContent = "";
            errorText2.textContent = "";

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
                document.querySelector("#loginArea").classList.add("hidden");
                document.querySelector("#profileArea").classList.remove("hidden");            
            }
        }

    // SHOW Pop-up
        function showPopup() {
            document.querySelector("#subscriptionPopup").classList.remove("hidden");
        }

        function resetPlanStates() {
            freeCol.style.border="1px solid #ddd";
            proCol.style.border="1px solid #ddd";
            premiumCol.style.border="1px solid #ddd";

            freeBtn.style.backgroundColor="";
            proBtn.style.backgroundColor="";
            premiumBtn.style.backgroundColor="";

            freeBtn.value="Change to Free"; 
            proBtn.value="Change to Pro";
            premiumBtn.value="Change to Premium";
            
            freeBtn.disabled=false;
            proBtn.disabled=false;
            premiumBtn.disabled=false;
        }

    // Subscription Pop-up
        function whenClicked() {
            resetPlanStates();
            var ans=document.querySelector("#ansbox");
            ans.textContent="Subscription Updated!";
            setTimeout(() => { ans.textContent = ""; }, 3000);
            ans.style.color="#00FF5E";

            var planText=document.querySelector("#currentPlanText");

            if (this.id==="freeButton") {
                this.value="Current Plan";              
                this.disabled=true;    
                planText.textContent="Free Tier";
                freeCol.style.border="3px solid #00FF5E";
            } 

            else if (this.id==="proButton") {
                this.value="Current Plan";              
                this.disabled=true;    
                planText.textContent="Pro Tier";
                proCol.style.border="3px solid #00FF5E";
            }

            else if (this.id==="premiumButton") {
                this.value="Current Plan";              
                this.disabled=true;    
                planText.textContent="Premium Tier";
                premiumCol.style.border="3px solid #00FF5E";
            }

        }

    // CLOSE Pop-up
        function closePopup() {
            document.querySelector("#subscriptionPopup").classList.add("hidden");
        }

