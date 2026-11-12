module App.Cart (Cart, total) where
import Prelude
import Data.Maybe (Maybe(..), fromMaybe)
import App.Store as Store
newtype Cart = Cart { total :: Int }
data Msg = Add Int | Remove
type Id = Int
class Shape a where
  area :: a -> Number
instance shapeCart :: Shape Cart where
  area _ = 1.0
total :: Cart -> Int -> Int
total c x = helper (Store.save c) x
helper a b = a + b
foreign import send :: String -> Int
fact 0 = 1
fact n = n * fact (n - 1)
