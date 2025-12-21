class CreateCheerEvents < ActiveRecord::Migration[7.2]
  def change
    create_table :cheer_events do |t|
      t.string :ip_address
      t.string :country
      t.string :city

      t.timestamps
    end
  end
end
