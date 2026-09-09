# Initial migrated database

`initial-data.sqlite` is generated from a final SQL Server backup after migration validation.
When packaged, the app includes that file and copies it to the Windows user-data folder on first launch.
The source `.Bak` file is never included in the installer.
