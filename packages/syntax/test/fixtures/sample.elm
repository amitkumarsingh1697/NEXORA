module App.Cart exposing (Cart, total)
import Html exposing (div, text)
import App.Store as Store
type alias Cart = { total : Int }
type Msg = Add Int | Remove
total : Cart -> Int -> Int
total c x = helper (Store.save c) x
helper a b = a + b
port send : String -> Cmd msg
