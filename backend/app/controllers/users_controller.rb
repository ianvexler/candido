class UsersController < ApplicationController
  before_action :require_authentication
  before_action :require_admin, only: %i[index resend_verification verify]

  def index
    render json: {
      users: serialize(
        User.all,
        with: UserBlueprint,
        entry_counts: JobBoardEntry.group(:user_id).count
      )
    }
  end

  def update
    current_user.update!(user_params)
    render json: { user: serialize(current_user, with: UserBlueprint) }
  end

  def resend_verification
    user = User.find(params[:id])
    user.regenerate_verification!
    UserMailer.verification_email(user).deliver_now

    render json: { user: serialize(user, with: UserBlueprint), message: "Verification email sent" }
  end

  def verify
    user = User.find(params[:id])
    user.mark_verified!

    render json: { user: serialize(user, with: UserBlueprint), message: "User verified" }
  end

  private

  def user_params
    params.permit(:setup_completed)
  end
end
