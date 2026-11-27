require "rails_helper"

RSpec.describe "Sessions" do
  describe "POST /api/v1/sessions" do
    it "logs in a verified user and sets the auth cookie" do
      user = create(:user, password: "secret123")

      post "/api/v1/sessions", params: { email: user.email, password: "secret123" }, as: :json

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["user"]).to include(
        "id" => user.id,
        "email" => user.email,
        "setup_completed" => false,
        "admin" => false
      )
      expect(response.parsed_body["user"]).not_to have_key("password")
      expect(response.parsed_body["user"]).not_to have_key("verification_token")
      expect(response.parsed_body["user"]).not_to have_key("job_board_entries_count")
      expect(response.parsed_body["token"]).to be_present
      expect(response.parsed_body["expires_at"]).to be_present
      expect(response.cookies["auth_token"]).to eq(response.parsed_body["token"])
    end

    it "rejects unverified users" do
      user = create(:user, :unverified, password: "secret123")

      post "/api/v1/sessions", params: { email: user.email, password: "secret123" }, as: :json

      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body).to eq("error" => "Please verify your email before signing in")
    end

    it "rejects invalid credentials" do
      user = create(:user, password: "secret123")

      post "/api/v1/sessions", params: { email: user.email, password: "wrong" }, as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body).to eq("error" => "Invalid email or password")
    end

    it "logs in with a Node bcrypt hash" do
      user = create(:user, password: "temporary")
      digest = BCrypt::Password.create("secret123", cost: 10).to_s.sub("$2a$", "$2b$")
      user.update_column(:password_digest, digest)

      post "/api/v1/sessions", params: { email: " #{user.email} ", password: "secret123" }, as: :json

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["user"]["id"]).to eq(user.id)
    end

    it "requires email and password" do
      post "/api/v1/sessions", params: { email: "a@b.com" }, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body).to eq("error" => "Email and password are required")
    end
  end

  describe "POST /api/v1/sessions/register" do
    it "creates an unverified user and sends a verification email" do
      expect do
        post "/api/v1/sessions/register",
          params: { email: "new@example.com", password: "secret123", name: "Ada" },
          as: :json
      end.to change(User, :count).by(1).and change { ActionMailer::Base.deliveries.size }.by(1)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["message"]).to eq("Please check your email to verify your account")
      expect(response.parsed_body["user"]).to include("email" => "new@example.com", "name" => "Ada")
      expect(response.parsed_body["user"]).not_to have_key("verification_token")
      expect(response.cookies["auth_token"]).to be_blank

      user = User.find_by!(email: "new@example.com")
      expect(user).not_to be_verified
      expect(ActionMailer::Base.deliveries.last.to).to eq([ "new@example.com" ])
      expect(ActionMailer::Base.deliveries.last.body.encoded).to include(user.verification_url)
    end

    it "rejects a duplicate email" do
      create(:user, email: "taken@example.com")

      post "/api/v1/sessions/register",
        params: { email: "taken@example.com", password: "secret123", name: "Ada" },
        as: :json

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body).to eq("error" => "User already exists")
    end
  end

  describe "GET /api/v1/sessions/verify" do
    it "verifies a valid token" do
      user = create(:user, :unverified)

      get "/api/v1/sessions/verify", params: { token: user.verification_token }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["message"]).to eq("Email verified successfully")
      expect(user.reload).to be_verified
      expect(user.verification_token).to be_nil
    end

    it "rejects an expired token" do
      user = create(:user, :unverified, verification_expires_at: 1.hour.ago)

      get "/api/v1/sessions/verify", params: { token: user.verification_token }

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body).to eq("error" => "Verification link has expired")
    end

    it "rejects a missing token" do
      get "/api/v1/sessions/verify"

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body).to eq("error" => "Verification token is required")
    end
  end

  describe "POST /api/v1/sessions/forgot_password" do
    it "emails a reset link to an existing user" do
      user = create(:user)

      expect do
        post "/api/v1/sessions/forgot_password", params: { email: " #{user.email} " }, as: :json
      end.to change { ActionMailer::Base.deliveries.size }.by(1)

      expect(response).to have_http_status(:ok)
      mail = ActionMailer::Base.deliveries.last
      expect(mail.to).to eq([ user.email ])
      expect(mail.subject).to eq("Reset your Candido password")
      expect(mail.text_part.body.decoded).to include("/reset-password?token=")
    end

    it "answers the same for an unknown email without sending anything" do
      expect do
        post "/api/v1/sessions/forgot_password", params: { email: "nobody@example.com" }, as: :json
      end.not_to(change { ActionMailer::Base.deliveries.size })

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["message"]).to eq(SessionsController::RESET_REQUESTED_MESSAGE)
    end

    it "requires an email" do
      post "/api/v1/sessions/forgot_password", params: {}, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body).to eq("error" => "Email is required")
    end
  end

  describe "POST /api/v1/sessions/reset_password" do
    it "sets the new password, verifies the user and ends their sessions" do
      user = create(:user, :unverified, password: "old-password")
      session_record = create(:session, user: user)
      token = user.generate_token_for(:password_reset)

      post "/api/v1/sessions/reset_password", params: { token: token, password: "new-password" }, as: :json

      expect(response).to have_http_status(:ok)
      user.reload
      expect(user.authenticate("new-password")).to eq(user)
      expect(user).to be_verified
      expect(Session.find_by(id: session_record.id)).to be_nil

      post "/api/v1/sessions", params: { email: user.email, password: "new-password" }, as: :json
      expect(response).to have_http_status(:created)
    end

    it "accepts the token from the emailed link" do
      user = create(:user)
      post "/api/v1/sessions/forgot_password", params: { email: user.email }, as: :json
      link = ActionMailer::Base.deliveries.last.text_part.body.decoded[%r{https?://\S+/reset-password\?token=\S+}]
      token = Rack::Utils.parse_query(URI.parse(link).query)["token"]

      post "/api/v1/sessions/reset_password", params: { token: token, password: "new-password" }, as: :json

      expect(response).to have_http_status(:ok)
    end

    it "rejects a token that has already been used" do
      user = create(:user)
      token = user.generate_token_for(:password_reset)
      post "/api/v1/sessions/reset_password", params: { token: token, password: "first-new" }, as: :json

      post "/api/v1/sessions/reset_password", params: { token: token, password: "second-new" }, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body).to eq("error" => "This reset link is invalid or has expired")
      expect(user.reload.authenticate("first-new")).to eq(user)
    end

    it "rejects an expired token" do
      user = create(:user)
      token = user.generate_token_for(:password_reset)

      travel(User::PASSWORD_RESET_TTL + 1.minute) do
        post "/api/v1/sessions/reset_password", params: { token: token, password: "new-password" }, as: :json
      end

      expect(response).to have_http_status(:bad_request)
    end

    it "requires a token and a password" do
      post "/api/v1/sessions/reset_password", params: { token: "abc" }, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body).to eq("error" => "Reset token and new password are required")
    end
  end

  describe "GET /api/v1/sessions/me" do
    it "returns the current user from the auth cookie" do
      user = create(:user)
      session_record = create(:session, user: user)

      get "/api/v1/sessions/me", headers: { "Cookie" => "auth_token=#{session_record.token}" }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["user"]).to include("id" => user.id, "email" => user.email)
    end

    it "rejects a missing token" do
      get "/api/v1/sessions/me"

      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body).to eq("error" => "Not authenticated")
    end
  end

  describe "DELETE /api/v1/sessions" do
    it "destroys the session and clears the cookie" do
      user = create(:user)
      session_record = create(:session, user: user)

      delete "/api/v1/sessions", headers: { "Cookie" => "auth_token=#{session_record.token}" }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("message" => "Logged out successfully")
      expect(Session.find_by(id: session_record.id)).to be_nil
    end
  end
end
