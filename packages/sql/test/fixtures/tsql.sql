CREATE TABLE [dbo].[Accounts] (
  [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [Owner] NVARCHAR(MAX) NULL
);
GO
SET NOCOUNT ON;
GO
CREATE OR ALTER PROCEDURE [dbo].[usp_AddAccount]
  @Owner NVARCHAR(200),
  @Balance DECIMAL(18, 2) = 0,
  @NewId INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.Accounts (Owner) VALUES (@Owner);
  SET @NewId = SCOPE_IDENTITY();
  EXEC dbo.usp_Audit @What = N'account';
  UPDATE a SET a.Owner = @Owner FROM dbo.Accounts a WHERE a.Id = @NewId;
  EXEC sp_executesql N'SELECT 1';
  BEGIN TRY
    DELETE FROM dbo.Pending WHERE Id = @NewId;
  END TRY
  BEGIN CATCH
    THROW;
  END CATCH
END
GO
CREATE FUNCTION dbo.fn_Balance (@Id INT) RETURNS DECIMAL(18, 2)
AS
BEGIN
  RETURN (SELECT SUM(Amount) FROM dbo.Ledger WHERE AccountId = @Id);
END
GO
CREATE TRIGGER dbo.trg_Accounts ON dbo.Accounts AFTER INSERT, UPDATE
AS
BEGIN
  INSERT INTO dbo.AuditLog (Msg) SELECT 'changed' FROM inserted;
END
GO
CREATE VIEW dbo.vw_Accounts WITH SCHEMABINDING AS SELECT Id, Owner FROM dbo.Accounts;
GO
CREATE NONCLUSTERED INDEX IX_Accounts_Owner ON dbo.Accounts (Owner) INCLUDE (Id);
GO
