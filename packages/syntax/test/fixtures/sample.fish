source ./lib.fish
function greet --description 'say hi' --argument-names name
    set -l msg (helper $name)
    echo $msg
    other_fn x
end
function helper
    string upper $argv
end
