# The current user's resume header: name and contact details shared by every resume.
class ResumeProfilesController < ApplicationController
  before_action :require_authentication

  def show
    render json: { profile: current_user.resume_header_profile }
  end

  # Replaces the whole profile.
  def update
    current_user.update_resume_profile!(params.require(:profile))
    render json: { profile: current_user.resume_header_profile }
  end
end
