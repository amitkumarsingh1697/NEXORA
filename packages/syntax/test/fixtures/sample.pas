unit Cart;
interface
uses SysUtils, App.Store;
type
  TCart = class(TBase, IShape)
  private
    FTotal: Integer;
  public
    constructor Create(a: Integer);
    function Total(const x: string; y: Integer = 2): Integer;
    procedure Clear;
    property Size: Integer read FTotal;
  end;
  TPoint = record x: Integer; end;
implementation
constructor TCart.Create(a: Integer);
begin
  inherited Create;
end;
function TCart.Total(const x: string; y: Integer): Integer;
var s: TStore;
begin
  s := TStore.Create;
  s.Save(x);
  Result := Helper(x);
  WriteLn(x);
end;
procedure TCart.Clear; begin end;
function Helper(x: string): Integer; begin Result := 1; end;
end.
